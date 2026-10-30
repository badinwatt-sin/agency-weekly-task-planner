import Link from "next/link";
import { FilterBar } from "@/components/FilterBar";
import { Icon } from "@/components/Icon";
import { TaskList } from "@/components/TaskList";
import { PageHeader, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getMembers, getMoves, getProjects, getTasks } from "@/lib/data";
import { formatDate, formatWeek, todayIso } from "@/lib/dates";
import { filterTasks, isOverdue, isUpcoming, parseFilters, sortTasks, taskListHref } from "@/lib/filters";
import { measure } from "@/lib/stats";
import { memberName, STATUS_LABEL } from "@/lib/types";

export const metadata = { title: "All tasks" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const filters = parseFilters(await searchParams);
  const [tasks, members, allMembers, projects, moves] = await Promise.all([getTasks(), getMembers(), getMembers(true), getProjects(true), getMoves()]);
  const today = todayIso();
  const memberMap = new Map(allMembers.map((m) => [m.id, m]));
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const result = sortTasks(filterTasks(tasks, filters, today, moves), today);
  const totals = measure(result);

  // Plain-language description of the active filters (shown for dashboard drill-downs).
  const describe: string[] = [];
  if (filters.owner) describe.push(filters.owner === "none" ? "unassigned" : `owner: ${memberName(memberMap.get(filters.owner))}`);
  if (filters.status) describe.push(`status: ${filters.status.map((s) => STATUS_LABEL[s]).join(" / ")}`);
  if (filters.project) describe.push(filters.project === "none" ? "no project" : `project: ${projectMap.get(filters.project)?.name ?? "?"}`);
  if (filters.dateField && (filters.from || filters.to)) {
    const label = { due: "due", start: "starting", planned: "planned", completed: "completed" }[filters.dateField];
    describe.push(`${label} ${filters.from ? `from ${formatDate(filters.from, { year: true })}` : ""} ${filters.to ? `to ${formatDate(filters.to, { year: true })}` : ""}`.trim());
    if (filters.withMoved) describe.push("including tasks later carried to another week");
  }
  if (filters.movedFrom)
    describe.push(filters.movedTo ? `carried out of a week between ${formatWeek(filters.movedFrom)} and ${formatWeek(filters.movedTo)}` : `carried out of ${formatWeek(filters.movedFrom)}`);
  if (filters.overdue) describe.push("overdue");
  if (filters.upcoming) describe.push("due in the next 7 days");
  if (filters.carried) describe.push("carried over at least once");

  return (
    <>
      <PageHeader
        title="All tasks"
        icon="list"
        subtitle={describe.length ? <>Showing tasks · {describe.join(" · ")}</> : "Search and filter every task across all weeks."}
        actions={
          user.isManager && (
            <Link href="/tasks/new" className="btn-primary hidden lg:inline-flex">
              <Icon name="plus" size={16} /> New task
            </Link>
          )
        }
      />
      <FilterBar path="/tasks" filters={filters} members={members} projects={projects.filter((p) => p.is_active)} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Tasks shown" value={totals.count} sub={`${totals.effort} effort pts · ${totals.unestimated} not estimated`} />
        <Stat label="Overdue" tone="overdue" value={result.filter((t) => isOverdue(t, today)).length} href={taskListHref({ ...filters, overdue: true })} />
        <Stat label="Due in 7 days" tone="doing" value={result.filter((t) => isUpcoming(t, today)).length} href={taskListHref({ ...filters, upcoming: true })} />
        <Stat label="Done" tone="done" value={result.filter((t) => t.status === "done").length} />
      </div>

      <TaskList tasks={result} members={memberMap} projects={projectMap} today={today} />
      {user.isManager && result.length > 0 && (
        <p className="mt-4 text-xs text-muted">
          Need this list in a spreadsheet? Use <Link href="/admin/team" className="font-semibold text-royal-700 underline">Team admin → Export CSV</Link>.
        </p>
      )}
    </>
  );
}
