-- Security and bookkeeping tests for the schema.
-- Run: psql -v ON_ERROR_STOP=1 -f 00_supabase_mock.sql -f ../migrations/0001_schema.sql -f ../seed.sql -f 10_rls_test.sql
\set ON_ERROR_STOP 1

-- Fixtures: two extra roster entries and three login accounts, linked by the "server" (postgres here)
insert into public.members (full_name, role, sort_order) values ('Test Member One', 'member', 1), ('Test Member Two', 'member', 2);
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'manager@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'member1@example.test'),
  ('00000000-0000-0000-0000-00000000000c', 'member2@example.test');
update public.members set user_id = '00000000-0000-0000-0000-00000000000a', account_status = 'active' where full_name = 'Keng';
update public.members set user_id = '00000000-0000-0000-0000-00000000000b', account_status = 'active' where full_name = 'Test Member One';
update public.members set user_id = '00000000-0000-0000-0000-00000000000c', account_status = 'active' where full_name = 'Test Member Two';
insert into public.member_private (member_id, employee_id, email)
select id, 'TEST-ONLY-1', 'member1@example.test' from public.members where full_name = 'Test Member One';

-- 1. Seed sanity: real-use start, no demo data
do $$ begin
  assert (select role from public.members where full_name = 'Keng') = 'manager', 'Keng is manager';
  assert (select count(*) from public.projects where name = 'General') = 1, 'General project';
  assert (select count(*) from public.tasks) = 0, 'no sample tasks';
  raise notice 'PASS 1 seed';
end $$;

-- 2. Anonymous visitors see nothing
begin;
set local role anon;
do $$ begin
  begin perform 1 from public.tasks limit 1; raise exception 'anon could read tasks';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.member_private limit 1; raise exception 'anon could read member_private';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS 2 anon blocked';
end $$;
commit;

-- 3. Manager: full editing, versioning, history
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$
declare
  me uuid := public.current_member_id();
  m1 uuid := (select id from public.members where full_name = 'Test Member One');
  wk date := date_trunc('week', public.app_today())::date;
  t uuid; v int; n int; moved int;
begin
  assert public.is_manager(), 'Keng is manager';
  assert (select count(*) from public.member_private) = 0, 'employee IDs readable only by the server';

  insert into public.tasks (title, owner_id, status, priority, planned_week, created_by)
  values ('Prepare client deck', m1, 'todo', 'high', wk, m1) returning id, version into t, v;
  assert (select created_by from public.tasks where id = t) = me, 'created_by cannot be forged';
  assert v = 1, 'initial version';

  update public.tasks set status = 'done' where id = t and version = 1;
  get diagnostics n = row_count; assert n = 1, 'manager updates';
  assert (select version from public.tasks where id = t) = 2, 'version incremented';
  assert (select completed_on from public.tasks where id = t) = public.app_today(), 'completed_on set';
  assert (select count(*) from public.task_activity where task_id = t) = 2, 'activity: created + updated';

  update public.tasks set title = 'stale' where id = t and version = 1;
  get diagnostics n = row_count; assert n = 0, 'stale version must not overwrite';

  update public.tasks set status = 'doing' where id = t;
  assert (select completed_on from public.tasks where id = t) is null, 'completed_on cleared';

  begin
    update public.tasks set planned_week = null where id = t;
    raise exception 'week constraint missing';
  exception when check_violation then null; end;

  insert into public.task_supporters values (t, (select id from public.members where full_name = 'Test Member Two'));
  insert into public.task_updates (task_id, author_id, body) values (t, m1, 'Client reviewing');
  assert (select author_id from public.task_updates where task_id = t) = me, 'comment author forced';

  moved := public.carry_over_week(wk);
  assert moved = 1, 'unfinished task carried';
  assert (select carry_over_count from public.tasks where id = t) = 1, 'carry count';
  assert (select count(*) from public.task_week_moves where task_id = t) = 1, 'week history kept';

  insert into public.meetings (title, meeting_date, week_start, notes, people, source)
  values ('Weekly', public.app_today(), wk, '• summary', jsonb_build_array(jsonb_build_object('member_id', m1, 'update', 'Deck sent')), 'claude');
  assert (select created_by from public.meetings limit 1) = me, 'meeting author set';

  begin
    update public.members set user_id = null where id = m1;
    raise exception 'manager changed account link';
  exception when insufficient_privilege then null; end;

  update public.tasks set archived_at = now() where id = t;
  raise notice 'PASS 3 manager';
end $$;
commit;

-- 4. Team member: reads everything, changes nothing
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$
declare
  me uuid := public.current_member_id();
  t uuid := (select id from public.tasks limit 1);
  n int;
begin
  assert me is not null and not public.is_manager(), 'member resolved';
  assert (select count(*) from public.tasks) = 1, 'member reads tasks';
  assert (select count(*) from public.meetings) = 1 and (select count(*) from public.task_updates) = 1, 'member reads meetings and updates';
  assert (select count(*) from public.member_private) = 0, 'employee IDs hidden';

  update public.tasks set title = 'hijack' where id = t;
  get diagnostics n = row_count; assert n = 0, 'member cannot edit tasks, even their own';

  begin insert into public.tasks (title, status) values ('mine', 'backlog'); raise exception 'member inserted a task';
  exception when insufficient_privilege then null; end;
  begin insert into public.task_updates (task_id, body) values (t, 'hi'); raise exception 'member commented';
  exception when insufficient_privilege then null; end;
  begin insert into public.meetings (title, meeting_date, week_start) values ('x', public.app_today(), date_trunc('week', public.app_today())::date); raise exception 'member recorded a meeting';
  exception when insufficient_privilege then null; end;
  begin insert into public.task_supporters values (t, me); raise exception 'member added supporter';
  exception when insufficient_privilege then null; end;
  begin perform public.carry_over_week(date_trunc('week', public.app_today())::date);
  exception when others then null; end;
  assert (select planned_week from public.tasks where id = t) = date_trunc('week', public.app_today())::date + 7, 'member cannot move weeks';

  update public.members set role = 'manager' where id = me;
  get diagnostics n = row_count; assert n = 0, 'member cannot promote self';
  delete from public.task_updates;
  get diagnostics n = row_count; assert n = 0, 'history is append-only';
  raise notice 'PASS 4 member is read-only';
end $$;
commit;

-- 5. Deactivated members lose access immediately
update public.members set is_active = false where full_name = 'Test Member Two';
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ begin
  assert (select count(*) from public.tasks) = 0, 'inactive sees no tasks';
  assert (select count(*) from public.members) = 0, 'inactive sees no roster';
  raise notice 'PASS 5 deactivation';
end $$;
commit;

-- 6. Authenticated user with no roster entry sees nothing
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000ff';
do $$ begin
  assert (select count(*) from public.tasks) = 0, 'stranger sees no tasks';
  raise notice 'PASS 6 unknown user';
end $$;
commit;
