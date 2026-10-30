import Link from "next/link";
import { ChartCard, ColumnChart, Legend } from "@/components/Charts";
import { Icon } from "@/components/Icon";
import { PageHeader, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getMoves, getProjects, getTasks } from "@/lib/data";
import { formatMonth, monthEnd, monthStart, todayIso } from "@/lib/dates";
import { isOverdue, taskListHref, type TaskFilters } from "@/lib/filters";
import { measure, yearSummary } from "@/lib/stats";

export const metadata = { title: "Annual overview" };

const PLANNED = "#9fb4ef";
const COMPLETED = "#0f8a5f";
const CARRIED = "#c27803";

export default async function YearPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser();
  const sp = await searchParams;
  const today = todayIso();
  const currentYear = Number(today.slice(0, 4));
  const year = sp.year && /^\d{4}$/.test(sp.year) && Number(sp.year) > 2000 && Number(sp.year) < 2100 ? Number(sp.year) : currentYear;
  const projectId = sp.project && /^[0-9a-f-]{36}$/i.test(sp.project) ? sp.project : undefined;

  const [allTasks, allMoves, projects] = await Promise.all([getTasks(), getMoves(), getProjects(true)]);
  const tasks = projectId ? allTasks.filter((t) => t.project_id === projectId) : allTasks;
  const ids = new Set(tasks.map((t) => t.id));
  const s = yearSummary(tasks, allMoves.filter((m) => ids.has(m.task_id)), year, today);
  const base: TaskFilters = projectId ? { project: projectId } : {};
  const y0 = `${year}-01-01`;
  const y1 = `${year}-12-31`;

  // Project mix for the year (count and effort completed)
  const doneThisYear = tasks.filter((t) => t.status === "done" && t.completed_on?.startsWith(String(year)));
  const byProject = projects
    .map((p) => ({ p, m: measure(doneThisYear.filter((t) => t.project_id === p.id)) }))
    .filter((r) => r.m.count > 0)
    .sort((a, b) => b.m.count - a.m.count);

  const yearHref = (y: number) => `/year?year=${y}${projectId ? `&project=${projectId}` : ""}`;

  return (
    <>
      <PageHeader
        title={`Annual overview ${year}`}
        icon="trend"
        subtitle="Monthly trends across the year. Numbers link to the underlying tasks."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href={yearHref(year - 1)} className="btn-secondary btn-sm" aria-label="Previous year">
              <Icon name="left" size={14} /> {year - 1}
            </Link>
            {year < currentYear + 1 && (
              <Link href={yearHref(year + 1)} className="btn-secondary btn-sm" aria-label="Next year">
                {year + 1} <Icon name="right" size={14} />
              </Link>
            )}
            <form method="get" className="flex gap-1">
              <input type="hidden" name="year" value={year} />
              <select name="project" defaultValue={projectId ?? ""} aria-label="Project" className="min-h-8 py-1 text-xs">
                <option value="">All projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button className="btn-ghost btn-sm">Go</button>
            </form>
          </div>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Completed in year" tone="done" value={s.completed.count} sub={`${s.completed.effort} effort pts`} href={taskListHref({ ...base, status: ["done"], dateField: "completed", from: y0, to: y1 })} />
        <Stat label="Ongoing" tone="doing" value={s.ongoing.count} sub="To Do / Doing planned this year" href={taskListHref({ ...base, status: ["todo", "doing"], dateField: "planned", from: y0, to: y1 })} />
        <Stat label="Overdue" tone="overdue" value={s.overdue.count} sub="due this year, not done" href={taskListHref({ ...base, overdue: true, dateField: "due", from: y0, to: y1 })} />
        <Stat label="Backlog" tone="backlog" value={s.backlog.count} sub="waiting to be scheduled" href={taskListHref({ ...base, status: ["backlog"] })} />
      </div>

      <ChartCard
        title="Monthly trend"
        subtitle="Planned (scheduled in a week starting that month, including later carry-overs), completed, and carried to a later week."
        legend={<Legend items={[{ label: "Planned", color: PLANNED }, { label: "Completed", color: COMPLETED }, { label: "Carried out", color: CARRIED }]} />}
      >
        <ColumnChart
          height={200}
          groups={s.months.map((m) => ({
            label: formatMonth(m.key, false),
            bars: [
              { value: m.planned.count, color: PLANNED, title: `${formatMonth(m.key)}: ${m.planned.count} planned`, href: taskListHref({ ...base, dateField: "planned", from: monthStart(m.key), to: monthEnd(m.key), withMoved: true }) },
              { value: m.completed.count, color: COMPLETED, title: `${formatMonth(m.key)}: ${m.completed.count} completed`, href: taskListHref({ ...base, status: ["done"], dateField: "completed", from: monthStart(m.key), to: monthEnd(m.key) }) },
              { value: m.carriedOut, color: CARRIED, title: `${formatMonth(m.key)}: ${m.carriedOut} carried out` },
            ],
          }))}
        />
      </ChartCard>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="card overflow-x-auto p-4">
          <h2 className="mb-3 font-bold text-navy-900">Month by month</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Month</th>
                <th className="text-right">Planned</th>
                <th className="text-right">Completed</th>
                <th className="text-right">Effort done</th>
                <th className="text-right">Carried out</th>
                <th className="text-right">Overdue now</th>
              </tr>
            </thead>
            <tbody>
              {s.months.map((m) => {
                const overdueInMonth = tasks.filter((t) => isOverdue(t, today) && t.due_date!.startsWith(m.key)).length;
                return (
                  <tr key={m.key}>
                    <td className="font-medium">{formatMonth(m.key)}</td>
                    <td className="text-right">
                      <Link className="num-link" href={taskListHref({ ...base, dateField: "planned", from: monthStart(m.key), to: monthEnd(m.key), withMoved: true })}>
                        {m.planned.count}
                      </Link>
                    </td>
                    <td className="text-right">
                      <Link className="num-link" href={taskListHref({ ...base, status: ["done"], dateField: "completed", from: monthStart(m.key), to: monthEnd(m.key) })}>
                        {m.completed.count}
                      </Link>
                    </td>
                    <td className="text-right text-muted">{m.completed.effort} pts</td>
                    <td className="text-right text-muted">{m.carriedOut}</td>
                    <td className="text-right">
                      {overdueInMonth ? (
                        <Link className="num-link text-st-overdue" href={taskListHref({ ...base, overdue: true, dateField: "due", from: monthStart(m.key), to: monthEnd(m.key) })}>
                          {overdueInMonth}
                        </Link>
                      ) : (
                        <span className="text-muted">0</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="card p-4">
          <h2 className="mb-1 font-bold text-navy-900">Completed work by project</h2>
          <p className="mb-3 text-xs text-muted">Task count, with estimated effort.</p>
          {byProject.length === 0 ? (
            <p className="text-sm text-muted">No completed tasks this year yet.</p>
          ) : (
            <ul className="space-y-2">
              {byProject.map(({ p, m }) => (
                <li key={p.id} className="flex items-center gap-2 text-sm">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: p.color }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  <Link className="num-link" href={taskListHref({ project: p.id, status: ["done"], dateField: "completed", from: y0, to: y1 })}>
                    {m.count}
                  </Link>
                  <span className="w-14 text-right text-xs text-muted">{m.effort} pts</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
