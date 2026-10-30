import Link from "next/link";
import type { TaskFilters } from "@/lib/filters";
import { memberName, PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL, type Member, type Project } from "@/lib/types";
import { FilterToggle } from "./FilterToggle";
import { Icon } from "./Icon";

type Field = "q" | "owner" | "status" | "project" | "priority" | "dates" | "flags";

/**
 * Plain GET form: filters live in the URL, so every filtered view can be
 * bookmarked or shared with a teammate, and it works without JavaScript.
 */
export function FilterBar({
  path,
  filters,
  members,
  projects,
  fields = ["q", "owner", "status", "project", "priority", "dates", "flags"],
  keep = {},
}: {
  path: string;
  filters: TaskFilters;
  members: Member[];
  projects: Project[];
  fields?: Field[];
  keep?: Record<string, string | undefined>;
}) {
  const has = (f: Field) => fields.includes(f);
  const active = Object.keys(filters).length > 0;
  const clearHref = (() => {
    const p = new URLSearchParams();
    Object.entries(keep).forEach(([k, v]) => v && p.set(k, v));
    const s = p.toString();
    return s ? `${path}?${s}` : path;
  })();

  return (
    <FilterToggle active={Object.keys(filters).length}>
    <form method="get" action={path} className="card mb-5 p-3" role="search" aria-label="Filter tasks">
      {Object.entries(keep).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:flex-wrap lg:items-end">
        {has("q") && (
          <div className="col-span-2 sm:col-span-3 lg:w-56">
            <label htmlFor="f-q" className="sr-only">
              Search
            </label>
            <div className="relative">
              <Icon name="search" size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
              <input id="f-q" name="q" type="search" defaultValue={filters.q} placeholder="Search tasks…" className="w-full pl-9" />
            </div>
          </div>
        )}
        {has("owner") && (
          <select name="owner" defaultValue={filters.owner ?? ""} aria-label="Owner" className="lg:w-48">
            <option value="">All owners</option>
            <option value="none">Unassigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {memberName(m)}
              </option>
            ))}
          </select>
        )}
        {has("status") && (
          <select name="status" defaultValue={filters.status?.join(",") ?? ""} aria-label="Status" className="lg:w-40">
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
            <option value="todo,doing">Open (To Do + Doing)</option>
            <option value="backlog,todo,doing">Not done</option>
          </select>
        )}
        {has("project") && (
          <select name="project" defaultValue={filters.project ?? ""} aria-label="Project" className="lg:w-48">
            <option value="">All projects</option>
            <option value="none">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        {has("priority") && (
          <select name="priority" defaultValue={filters.priority ?? ""} aria-label="Priority" className="lg:w-36">
            <option value="">All priorities</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        )}
        {has("dates") && (
          <>
            <select name="dateField" defaultValue={filters.dateField ?? "due"} aria-label="Date type" className="lg:w-40">
              <option value="due">Due date</option>
              <option value="start">Start date</option>
              <option value="planned">Planned week</option>
              <option value="completed">Completion date</option>
            </select>
            <input type="date" name="from" defaultValue={filters.from} aria-label="From date" className="lg:w-40" />
            <input type="date" name="to" defaultValue={filters.to} aria-label="To date" className="lg:w-40" />
          </>
        )}
        {has("flags") && (
          <div className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-2 px-1 sm:col-span-3 lg:col-span-1 lg:py-2">
            <label className="flex items-center gap-1.5 font-normal">
              <input type="checkbox" name="overdue" value="1" defaultChecked={filters.overdue} /> Overdue
            </label>
            <label className="flex items-center gap-1.5 font-normal">
              <input type="checkbox" name="upcoming" value="1" defaultChecked={filters.upcoming} /> Due in 7 days
            </label>
            <label className="flex items-center gap-1.5 font-normal">
              <input type="checkbox" name="carried" value="1" defaultChecked={filters.carried} /> Carried over
            </label>
          </div>
        )}
        <div className="col-span-2 flex gap-2 sm:col-span-3 lg:col-span-1 lg:ml-auto">
          <button className="btn-primary flex-1 lg:flex-none">
            <Icon name="filter" size={16} /> Apply
          </button>
          {active && (
            <Link href={clearHref} className="btn-ghost">
              Clear
            </Link>
          )}
        </div>
      </div>
    </form>
    </FilterToggle>
  );
}
