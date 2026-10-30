-- =====================================================================
-- Seed: the Manager entry and a starter project. Safe to run more than once.
--
-- Team members' names are NOT stored in this public repository. Either:
--   * run supabase/roster.local.sql (kept outside git, see .gitignore), or
--   * add people in the app: Team admin → "Add a team member".
-- No sample or demo tasks are created: the planner starts empty, ready for real work.
-- =====================================================================

insert into public.members (full_name, display_name, role, sort_order)
select 'Keng', 'Keng', 'manager', 0
where not exists (select 1 from public.members where role = 'manager');

insert into public.projects (name, color)
select 'General', '#2952CC'
where not exists (select 1 from public.projects where lower(name) = 'general');
