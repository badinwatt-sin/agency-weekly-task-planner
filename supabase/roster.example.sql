-- Copy to supabase/roster.local.sql (git-ignored), replace the names, then run it
-- in the Supabase SQL editor after seed.sql. Safe to run more than once.
insert into public.members (full_name, role, sort_order)
select v.full_name, 'member', v.sort_order
from (values
  ('First Person Name', 1),
  ('Second Person Name', 2)
) as v(full_name, sort_order)
where not exists (select 1 from public.members m where m.full_name = v.full_name);
