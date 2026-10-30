-- =====================================================================
-- Agency Weekly Task Planner — schema, triggers and row-level security
-- Run once in the Supabase SQL editor (or `supabase db push`).
-- All dates are calendar dates in the agency time zone (Asia/Bangkok).
-- Weeks start on Monday; `planned_week` always stores that Monday.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Types ----------
do $$ begin
  create type public.app_role as enum ('member', 'manager');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.task_status as enum ('backlog', 'todo', 'doing', 'done');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.task_priority as enum ('high', 'medium', 'low');
exception when duplicate_object then null; end $$;

-- ---------- Helpers ----------
create or replace function public.app_today()
returns date language sql stable as $$
  select (now() at time zone 'Asia/Bangkok')::date
$$;

-- ---------- Team roster ----------
create table if not exists public.members (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid unique references auth.users (id) on delete set null,
  full_name     text not null check (char_length(btrim(full_name)) between 1 and 120),
  display_name  text check (display_name is null or char_length(display_name) <= 60),
  role          public.app_role not null default 'member',
  is_active     boolean not null default true,
  account_status text not null default 'no_account'
                check (account_status in ('no_account', 'invited', 'active')),
  sort_order    int not null default 100,
  is_sample     boolean not null default false,  -- fictional placeholder used only by demo tasks
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Employee IDs and login emails live in a separate table that has RLS
-- enabled and NO policies: only the server (service role) can read it.
-- They are never sent to the browser.
create table if not exists public.member_private (
  member_id     uuid primary key references public.members (id) on delete cascade,
  employee_id   text not null check (char_length(btrim(employee_id)) between 1 and 64),
  employee_id_normalized text generated always as (upper(btrim(employee_id))) stored,
  email         text not null check (position('@' in email) > 1),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint member_private_employee_id_unique unique (employee_id_normalized)
);
create unique index if not exists member_private_email_unique on public.member_private (lower(email));

-- ---------- Projects / categories ----------
create table if not exists public.projects (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 80),
  color      text not null default '#2952CC' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  is_active  boolean not null default true,
  is_sample  boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists projects_name_unique on public.projects (lower(name));

-- ---------- Weekly meetings ----------
create table if not exists public.meetings (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(btrim(title)) between 1 and 160),
  meeting_date date not null,
  week_start   date not null check (extract(isodow from week_start) = 1),
  notes        text check (notes is null or char_length(notes) <= 20000),
  -- one entry per person: [{"member_id": "...", "update": "..."}]
  people       jsonb not null default '[]'::jsonb check (jsonb_typeof(people) = 'array'),
  source       text not null default 'manual' check (source in ('manual', 'claude')),
  is_sample    boolean not null default false,
  created_by   uuid references public.members (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------- Tasks ----------
create table if not exists public.tasks (
  id               uuid primary key default gen_random_uuid(),
  title            text not null check (char_length(btrim(title)) between 1 and 200),
  description      text check (description is null or char_length(description) <= 5000),
  project_id       uuid references public.projects (id) on delete set null,
  owner_id         uuid references public.members (id) on delete set null,
  status           public.task_status not null default 'backlog',
  priority         public.task_priority not null default 'medium',
  planned_week     date check (planned_week is null or extract(isodow from planned_week) = 1),
  start_date       date,
  due_date         date,
  completed_on     date,
  effort_points    smallint check (effort_points is null or effort_points in (1, 2, 3, 5, 8)),
  notes            text check (notes is null or char_length(notes) <= 10000),
  links            jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array'),
  meeting_id       uuid references public.meetings (id) on delete set null,
  carry_over_count int not null default 0,
  is_sample        boolean not null default false,
  archived_at      timestamptz,
  version          int not null default 1,
  created_by       uuid references public.members (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_by       uuid references public.members (id) on delete set null,
  updated_at       timestamptz not null default now(),
  constraint tasks_dates_order check (due_date is null or start_date is null or due_date >= start_date),
  constraint tasks_week_required check (status = 'backlog' or planned_week is not null)
);
create index if not exists tasks_planned_week_idx on public.tasks (planned_week);
create index if not exists tasks_owner_idx on public.tasks (owner_id);
create index if not exists tasks_due_idx on public.tasks (due_date);
create index if not exists tasks_status_idx on public.tasks (status);

create table if not exists public.task_supporters (
  task_id   uuid not null references public.tasks (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  primary key (task_id, member_id)
);

-- Comments and progress updates (append-only)
create table if not exists public.task_updates (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  author_id  uuid references public.members (id) on delete set null,
  kind       text not null default 'comment' check (kind in ('comment', 'progress')),
  body       text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists task_updates_task_idx on public.task_updates (task_id, created_at);

-- Who changed what, when (written only by triggers)
create table if not exists public.task_activity (
  id         bigint generated always as identity primary key,
  task_id    uuid not null references public.tasks (id) on delete cascade,
  actor_id   uuid references public.members (id) on delete set null,
  action     text not null,
  changes    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists task_activity_task_idx on public.task_activity (task_id, created_at);

-- Every change of planned week for unfinished work (carry-over history)
create table if not exists public.task_week_moves (
  id             bigint generated always as identity primary key,
  task_id        uuid not null references public.tasks (id) on delete cascade,
  from_week      date not null,
  to_week        date,
  status_at_move public.task_status not null,
  moved_by       uuid references public.members (id) on delete set null,
  moved_at       timestamptz not null default now()
);
create index if not exists task_week_moves_from_idx on public.task_week_moves (from_week);

-- Login / reset throttling (server only)
create table if not exists public.auth_attempts (
  id         bigint generated always as identity primary key,
  kind       text not null check (kind in ('login', 'reset')),
  key_hash   text not null,
  ip_hash    text not null,
  success    boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists auth_attempts_key_idx on public.auth_attempts (kind, key_hash, created_at);
create index if not exists auth_attempts_ip_idx on public.auth_attempts (kind, ip_hash, created_at);

-- Administration audit log (server only)
create table if not exists public.admin_audit (
  id         bigint generated always as identity primary key,
  actor_id   uuid references public.members (id) on delete set null,
  action     text not null,
  target_id  uuid,
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- Identity helpers (SECURITY DEFINER so policies can call them safely)
-- =====================================================================
create or replace function public.current_member_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select m.id from public.members m
  where m.user_id = auth.uid() and m.is_active
$$;

create or replace function public.is_active_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members m where m.user_id = auth.uid() and m.is_active)
$$;

create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members m
    where m.user_id = auth.uid() and m.is_active and m.role = 'manager'
  )
$$;

-- The Manager keeps the planner up to date; team members view it.
-- To let members edit their own tasks too, return:
--   public.is_manager() or exists (select 1 from public.tasks t where t.id = p_task_id
--     and public.current_member_id() in (t.owner_id, t.created_by))
-- and loosen tasks_insert / updates_insert / meetings_insert below to is_active_member().
create or replace function public.can_edit_task(p_task_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_manager()
$$;

revoke execute on function public.current_member_id() from anon;
revoke execute on function public.is_active_member() from anon;
revoke execute on function public.is_manager() from anon;
revoke execute on function public.can_edit_task(uuid) from anon;

-- =====================================================================
-- Triggers
-- =====================================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists members_touch on public.members;
create trigger members_touch before update on public.members
  for each row execute function public.touch_updated_at();
drop trigger if exists meetings_touch on public.meetings;
create trigger meetings_touch before update on public.meetings
  for each row execute function public.touch_updated_at();
drop trigger if exists member_private_touch on public.member_private;
create trigger member_private_touch before update on public.member_private
  for each row execute function public.touch_updated_at();

-- Only the server (service role) may link roster entries to login accounts.
create or replace function public.members_guard()
returns trigger language plpgsql as $$
begin
  if (new.user_id is distinct from old.user_id or new.account_status is distinct from old.account_status)
     and current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'Account links can only be changed by the server' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists members_guard on public.members;
create trigger members_guard before update on public.members
  for each row execute function public.members_guard();

-- Task bookkeeping: authorship, version, completion date, carry-over count.
create or replace function public.tasks_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.current_member_id();
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(me, new.created_by);
    new.updated_by := coalesce(me, new.created_by);
    new.version := 1;
    new.carry_over_count := 0;
    new.archived_at := null;
    if new.status = 'done' then
      new.completed_on := coalesce(new.completed_on, public.app_today());
    else
      new.completed_on := null;
    end if;
    if me is not null and not public.is_manager() then
      new.is_sample := false;
    end if;
    return new;
  end if;

  -- UPDATE
  new.id := old.id;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.version := old.version + 1;
  new.updated_at := now();
  new.updated_by := coalesce(me, new.updated_by);

  if me is not null and not public.is_manager() then
    if new.archived_at is distinct from old.archived_at or new.is_sample is distinct from old.is_sample then
      raise exception 'Only the Manager can archive tasks' using errcode = '42501';
    end if;
  end if;

  if new.status = 'done' then
    new.completed_on := coalesce(new.completed_on, old.completed_on, public.app_today());
  else
    new.completed_on := null;
  end if;

  if old.planned_week is not null and new.planned_week is not null
     and new.planned_week > old.planned_week and old.status <> 'done' then
    new.carry_over_count := old.carry_over_count + 1;
  else
    new.carry_over_count := old.carry_over_count;
  end if;
  return new;
end $$;

drop trigger if exists tasks_before_write on public.tasks;
create trigger tasks_before_write before insert or update on public.tasks
  for each row execute function public.tasks_before_write();

-- Activity log + week-move history.
create or replace function public.tasks_after_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.current_member_id();
  diff jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.task_activity (task_id, actor_id, action, changes)
    values (new.id, coalesce(me, new.created_by), 'created',
            jsonb_build_object('status', new.status, 'title', new.title));
    return null;
  end if;

  select coalesce(jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value)), '{}'::jsonb)
    into diff
  from jsonb_each(to_jsonb(new)) n
  join jsonb_each(to_jsonb(old)) o on o.key = n.key
  where n.value is distinct from o.value
    and n.key not in ('version', 'updated_at', 'updated_by', 'carry_over_count');

  if diff <> '{}'::jsonb then
    insert into public.task_activity (task_id, actor_id, action, changes)
    values (new.id, coalesce(me, new.updated_by),
            case when diff ? 'archived_at' and new.archived_at is not null then 'archived'
                 when diff ? 'planned_week' and new.carry_over_count > old.carry_over_count then 'carried_over'
                 else 'updated' end,
            diff);
  end if;

  if old.planned_week is not null and new.planned_week is distinct from old.planned_week
     and old.status <> 'done' then
    insert into public.task_week_moves (task_id, from_week, to_week, status_at_move, moved_by)
    values (new.id, old.planned_week, new.planned_week, old.status, coalesce(me, new.updated_by));
  end if;
  return null;
end $$;

drop trigger if exists tasks_after_write on public.tasks;
create trigger tasks_after_write after insert or update on public.tasks
  for each row execute function public.tasks_after_write();

create or replace function public.supporters_after_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.task_activity (task_id, actor_id, action, changes)
  values (coalesce(new.task_id, old.task_id), public.current_member_id(),
          case when tg_op = 'INSERT' then 'supporter_added' else 'supporter_removed' end,
          jsonb_build_object('member_id', coalesce(new.member_id, old.member_id)));
  return null;
end $$;

drop trigger if exists supporters_after_write on public.task_supporters;
create trigger supporters_after_write after insert or delete on public.task_supporters
  for each row execute function public.supporters_after_write();

-- Comment authorship cannot be forged.
create or replace function public.task_updates_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.author_id := coalesce(public.current_member_id(), new.author_id);
  new.created_at := now();
  return new;
end $$;
drop trigger if exists task_updates_before_insert on public.task_updates;
create trigger task_updates_before_insert before insert on public.task_updates
  for each row execute function public.task_updates_before_insert();

create or replace function public.meetings_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.created_by := coalesce(public.current_member_id(), new.created_by);
  return new;
end $$;
drop trigger if exists meetings_before_insert on public.meetings;
create trigger meetings_before_insert before insert on public.meetings
  for each row execute function public.meetings_before_insert();

-- Bulk carry-over of unfinished work to the following week.
-- SECURITY INVOKER: row-level security still decides which rows move.
create or replace function public.carry_over_week(p_from_week date)
returns int language plpgsql security invoker set search_path = '' as $$
declare
  moved int;
begin
  if extract(isodow from p_from_week) <> 1 then
    raise exception 'Week must start on a Monday';
  end if;
  update public.tasks
     set planned_week = p_from_week + 7
   where planned_week = p_from_week
     and status in ('todo', 'doing')
     and archived_at is null;
  get diagnostics moved = row_count;
  return moved;
end $$;
revoke execute on function public.carry_over_week(date) from anon;

-- =====================================================================
-- Row-level security
-- =====================================================================
alter table public.members         enable row level security;
alter table public.member_private  enable row level security;  -- no policies: server only
alter table public.projects        enable row level security;
alter table public.meetings        enable row level security;
alter table public.tasks           enable row level security;
alter table public.task_supporters enable row level security;
alter table public.task_updates    enable row level security;
alter table public.task_activity   enable row level security;
alter table public.task_week_moves enable row level security;
alter table public.auth_attempts   enable row level security;  -- no policies: server only
alter table public.admin_audit     enable row level security;  -- no policies: server only

-- Remove any default grants to anonymous visitors.
revoke all on all tables in schema public from anon;

-- members
drop policy if exists members_select on public.members;
create policy members_select on public.members for select to authenticated
  using (public.is_active_member());
drop policy if exists members_insert on public.members;
create policy members_insert on public.members for insert to authenticated
  with check (public.is_manager());
drop policy if exists members_update on public.members;
create policy members_update on public.members for update to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- projects
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select to authenticated
  using (public.is_active_member());
drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects for insert to authenticated
  with check (public.is_manager());
drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects for update to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- meetings
drop policy if exists meetings_select on public.meetings;
create policy meetings_select on public.meetings for select to authenticated
  using (public.is_active_member());
drop policy if exists meetings_insert on public.meetings;
create policy meetings_insert on public.meetings for insert to authenticated
  with check (public.is_manager());
drop policy if exists meetings_update on public.meetings;
create policy meetings_update on public.meetings for update to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- tasks (no DELETE policy: tasks are archived, never hard-deleted by users)
-- Everyone on the team reads; only the Manager writes.
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select to authenticated
  using (public.is_active_member());
drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for insert to authenticated
  with check (public.is_manager());
drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update to authenticated
  using (public.can_edit_task(id)) with check (public.is_active_member());

-- supporters
drop policy if exists supporters_select on public.task_supporters;
create policy supporters_select on public.task_supporters for select to authenticated
  using (public.is_active_member());
drop policy if exists supporters_insert on public.task_supporters;
create policy supporters_insert on public.task_supporters for insert to authenticated
  with check (public.can_edit_task(task_id));
drop policy if exists supporters_delete on public.task_supporters;
create policy supporters_delete on public.task_supporters for delete to authenticated
  using (public.can_edit_task(task_id));

-- progress updates / comments: written by the Manager, read by everyone, never rewritten
drop policy if exists updates_select on public.task_updates;
create policy updates_select on public.task_updates for select to authenticated
  using (public.is_active_member());
drop policy if exists updates_insert on public.task_updates;
create policy updates_insert on public.task_updates for insert to authenticated
  with check (public.is_manager());

-- activity + week moves: read-only for the team, written by triggers
drop policy if exists activity_select on public.task_activity;
create policy activity_select on public.task_activity for select to authenticated
  using (public.is_active_member());
drop policy if exists moves_select on public.task_week_moves;
create policy moves_select on public.task_week_moves for select to authenticated
  using (public.is_active_member());

-- Live board refresh (Supabase Realtime honours the select policies above).
do $$ begin
  alter publication supabase_realtime add table public.tasks;
exception when others then null; end $$;
