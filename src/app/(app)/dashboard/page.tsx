import Link from "next/link";
import { ChartCard, ColumnChart, Legend, StackedRows } from "@/components/Charts";
import { Icon } from "@/components/Icon";
import { TaskList } from "@/components/TaskList";
import { Avatar, Notice, PageHeader, Stat, STATUS_STYLE } from "@/components/ui";
import { requireManager } from "@/lib/auth";
import { getMembers, getMoves, getProjects, getTasks } from "@/lib/data";
import { addDays, formatDate, formatMonth, formatWeekShort, isIsoDate, monthEnd, monthsInRange, monthStart, todayIso, weekEnd, weekStart, weeksInRange } from "@/lib/dates";
import { taskListHref, type TaskFilters } from "@/lib/filters";
import { countByStatus, inDashboardScope, monthlySeries, overdueTasks, statusByMember, upcomingTasks, weeklySeries, workloadByOwner } from "@/lib/stats";
import { memberName, STATUSES, STATUS_LABEL, type TaskStatus } from "@/lib/types";

export const metadata = { title: "Manager dashboard" };

const PLANNED = "#9fb4ef";
const COMPLETED = "#0f8a5f";
const CARRIED = "#c27803";
const EFFORT = "#7c3aed";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireManager();
  const sp = await searchParams;
  const today = todayIso();

  // Period defaults to the last 8 weeks including this one. Always whole weeks.
  const from = weekStart(isIsoDate(sp.from) ? sp.from : addDays(weekStart(today), -49));
  const to = weekEnd(isIsoDate(sp.to) && sp.to >= from ? sp.to : today);
  const projectId = sp.project && /^[0-9a-f-]{36}$/i.test(sp.project) ? sp.project : undefined;

  const [allTasks, members, allMembers, projects, allMoves] = await Promise.all([getTasks(), getMembers(), getMembers(true), getProjects(true), getMoves()]);
  const tasks = projectId ? allTasks.filter((t) => t.project_id === projectId) : allTasks;
  const ids = new Set(tasks.map((t) => t.id));
  const moves = allMoves.filter((m) => ids.has(m.task_id));
  const memberMap = new Map(allMembers.map((m) => [m.id, m]));
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const base: TaskFilters = projectId ? { project: projectId } : {};
  const plannedRange: TaskFilters = { ...base, dateField: "planned", from, to };

  const scoped = tasks.filter((t) => inDashboardScope(t, from, to));
  const byStatus = countByStatus(scoped);
  const perMember = statusByMember(scoped, members).filter((r) => r.total.count > 0 || (r.memberId && memberMap.get(r.memberId)?.is_active && !memberMap.get(r.memberId)?.is_sample));
  const weeks = weeksInRange(from, to);
  const weekly = weeklySeries(tasks, moves, weeks);
  const monthly = monthlySeries(tasks, moves, monthsInRange(from, to));
  const workload = workloadByOwner(scoped, members, today).filter((r) => r.open.count > 0 || (r.memberId && !memberMap.get(r.memberId)?.is_sample));
  const overdue = overdueTasks(tasks, today);
  const upcoming = upcomingTasks(tasks, today);
  const carriedTotal = new Set(moves.filter((m) => m.from_week >= from && m.from_week <= to).map((m) => m.task_id)).size;
  const maxOpenCount = Math.max(1, ...workload.map((w) => w.open.count));
  const maxOpenEffort = Math.max(1, ...workload.map((w) => w.open.effort));

  const ownerParam = (id: string | null) => id ?? "none";

  return (
    <>
      <PageHeader
        title="Manager dashboard"
        icon="chart"
        subtitle={`${formatDate(from, { year: true })} – ${formatDate(to, { year: true })}${projectId ? ` · ${projectMap.get(projectId)?.name}` : " · all projects"}. Every number links to the tasks behind it.`}
      />

      <form method="get" className="card mb-5 grid grid-cols-2 gap-2 p-3 sm:flex sm:flex-wrap sm:items-end">
        <div>
          <label htmlFor="d-from" className="text-xs">
            From
          </label>
          <input id="d-from" type="date" name="from" defaultValue={from} className="mt-1 w-full" />
        </div>
        <div>
          <label htmlFor="d-to" className="text-xs">
            To
          </label>
          <input id="d-to" type="date" name="to" defaultValue={to} className="mt-1 w-full" />
        </div>
        <div className="col-span-2 sm:w-56">
          <label htmlFor="d-project" className="text-xs">
            Project
          </label>
          <select id="d-project" name="project" defaultValue={projectId ?? ""} className="mt-1 w-full">
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <button className="btn-primary col-span-2 sm:col-span-1">Apply</button>
        <div className="col-span-2 flex flex-wrap gap-1 text-xs sm:ml-auto">
          {[
            ["This month", monthStart(today.slice(0, 7)), monthEnd(today.slice(0, 7))],
            ["Last 4 weeks", addDays(weekStart(today), -21), today],
            ["Last 13 weeks", addDays(weekStart(today), -84), today],
            ["Year to date", `${today.slice(0, 4)}-01-01`, today],
          ].map(([label, f, t]) => (
            <Link key={label} href={`/dashboard?from=${f}&to=${t}${projectId ? `&project=${projectId}` : ""}`} className="btn-ghost btn-sm">
              {label}
            </Link>
          ))}
        </div>
      </form>

      <div className="mb-5">
        <Notice>
          <strong>How to read this page:</strong> task counts and effort points are shown separately because tasks differ in size and complexity. Effort is a rough estimate
          entered by the team and some tasks are not estimated. These figures are a starting point for conversation — they are not a performance rating, and they don't capture
          quality, context or work outside the planner.
        </Notice>
      </div>

      {/* Headline numbers */}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {STATUSES.map((s) => (
          <Stat
            key={s}
            label={s === "backlog" ? "Backlog (all)" : STATUS_LABEL[s]}
            tone={s}
            value={byStatus[s].count}
            sub={`${byStatus[s].effort} pts${byStatus[s].unestimated ? ` · ${byStatus[s].unestimated} unestimated` : ""}`}
            href={taskListHref(s === "backlog" ? { ...base, status: ["backlog"] } : { ...plannedRange, status: [s] })}
          />
        ))}
        <Stat label="Overdue now" tone="overdue" value={overdue.length} sub="not done, past due date" href={taskListHref({ ...base, overdue: true })} />
        <Stat label="Carried over" value={carriedTotal} sub={`tasks moved out of a week in this period`} href={taskListHref({ ...base, movedFrom: from, movedTo: weekStart(to) })} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <ChartCard
          title="Tasks by status and team member"
          subtitle="Backlog (any week) plus To Do / Doing / Done planned in the period. Click a segment to see the tasks."
          legend={<Legend items={STATUSES.map((s) => ({ label: STATUS_LABEL[s], color: STATUS_STYLE[s].bar }))} />}
        >
          <StackedRows
            rows={perMember.map((r) => ({
              key: r.memberId ?? "none",
              label: (
                <span className="flex items-center gap-2">
                  <Avatar member={r.memberId ? memberMap.get(r.memberId) : null} size="sm" />
                  <span className="truncate">{memberName(r.memberId ? memberMap.get(r.memberId) : null)}</span>
                </span>
              ),
              segments: STATUSES.map((s) => ({
                value: r.byStatus[s].count,
                color: STATUS_STYLE[s].bar,
                title: `${memberName(r.memberId ? memberMap.get(r.memberId) : null)} · ${STATUS_LABEL[s]}: ${r.byStatus[s].count}`,
                href: taskListHref(s === "backlog" ? { ...base, owner: ownerParam(r.memberId), status: ["backlog"] } : { ...plannedRange, owner: ownerParam(r.memberId), status: [s] }),
              })),
              total: `${r.total.count}`,
            }))}
          />
          <details className="mt-4">
            <summary className="cursor-pointer text-xs font-semibold text-royal-700">Show as table (counts · effort points)</summary>
            <div className="mt-2 overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Person</th>
                    {STATUSES.map((s) => (
                      <th key={s} className="text-right">
                        {STATUS_LABEL[s]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {perMember.map((r) => (
                    <tr key={r.memberId ?? "none"}>
                      <td>{memberName(r.memberId ? memberMap.get(r.memberId) : null)}</td>
                      {STATUSES.map((s) => (
                        <td key={s} className="text-right whitespace-nowrap">
                          <Link className="num-link" href={taskListHref(s === "backlog" ? { ...base, owner: ownerParam(r.memberId), status: ["backlog"] } : { ...plannedRange, owner: ownerParam(r.memberId), status: [s as TaskStatus] })}>
                            {r.byStatus[s].count}
                          </Link>
                          <span className="text-xs text-muted"> · {r.byStatus[s].effort}</span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </ChartCard>

        <ChartCard
          title="Open workload by owner"
          subtitle="To Do + Doing planned in the period. Left: number of tasks. Right: estimated effort points."
          legend={<Legend items={[{ label: "Tasks", color: "#2952cc" }, { label: "Effort pts", color: EFFORT }]} />}
        >
          <ul className="space-y-2">
            {workload.map((w) => {
              const name = memberName(w.memberId ? memberMap.get(w.memberId) : null);
              const href = taskListHref({ ...plannedRange, owner: ownerParam(w.memberId), status: ["todo", "doing"] });
              return (
                <li key={w.memberId ?? "none"} className="grid grid-cols-[minmax(0,8rem)_1fr_1fr] items-center gap-2 text-sm sm:grid-cols-[minmax(0,11rem)_1fr_1fr]">
                  <span className="truncate">{name}</span>
                  <Link href={href} className="flex items-center gap-1.5" title={`${name}: ${w.open.count} open tasks`}>
                    <span className="h-3 rounded bg-royal-600" style={{ width: `${(w.open.count / maxOpenCount) * 100}%`, minWidth: w.open.count ? 3 : 0 }} />
                    <span className="text-xs font-semibold tabular-nums">{w.open.count}</span>
                    {w.overdue > 0 && <span className="text-[10px] font-bold whitespace-nowrap text-st-overdue">{w.overdue} late</span>}
                  </Link>
                  <Link href={href} className="flex items-center gap-1.5" title={`${name}: ${w.open.effort} effort points, ${w.open.unestimated} not estimated`}>
                    <span className="h-3 rounded" style={{ width: `${(w.open.effort / maxOpenEffort) * 100}%`, minWidth: w.open.effort ? 3 : 0, backgroundColor: EFFORT }} />
                    <span className="text-xs font-semibold tabular-nums">{w.open.effort}</span>
                    {w.open.unestimated > 0 && <span className="text-[10px] whitespace-nowrap text-muted">+{w.open.unestimated} unest.</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </ChartCard>

        <ChartCard
          title="Planned vs completed by week"
          subtitle="Planned = tasks scheduled for the week (including ones later carried forward). Completed = completion date in that week."
          legend={<Legend items={[{ label: "Planned", color: PLANNED }, { label: "Completed", color: COMPLETED }, { label: "Carried out", color: CARRIED }]} />}
        >
          <ColumnChart
            groups={weekly.map((w) => ({
              label: formatWeekShort(w.key).split(" ")[0],
              sub: formatDate(w.key),
              bars: [
                { value: w.planned.count, color: PLANNED, title: `${formatWeekShort(w.key)}: ${w.planned.count} planned (${w.planned.effort} pts)`, href: taskListHref({ ...base, dateField: "planned", from: w.key, to: w.key, withMoved: true }) },
                { value: w.completed.count, color: COMPLETED, title: `${formatWeekShort(w.key)}: ${w.completed.count} completed (${w.completed.effort} pts)`, href: taskListHref({ ...base, status: ["done"], dateField: "completed", from: w.key, to: addDays(w.key, 6) }) },
                { value: w.carriedOut, color: CARRIED, title: `${formatWeekShort(w.key)}: ${w.carriedOut} carried to a later week`, href: taskListHref({ ...base, movedFrom: w.key }) },
              ],
            }))}
          />
        </ChartCard>

        <ChartCard
          title="Planned vs completed by month"
          subtitle="Counts, with effort points underneath."
          legend={<Legend items={[{ label: "Planned", color: PLANNED }, { label: "Completed", color: COMPLETED }]} />}
        >
          <ColumnChart
            groups={monthly.map((m) => ({
              label: formatMonth(m.key, false),
              sub: `${m.planned.effort}/${m.completed.effort} pts`,
              bars: [
                { value: m.planned.count, color: PLANNED, title: `${formatMonth(m.key)}: ${m.planned.count} planned`, href: taskListHref({ ...base, dateField: "planned", from: monthStart(m.key), to: monthEnd(m.key), withMoved: true }) },
                { value: m.completed.count, color: COMPLETED, title: `${formatMonth(m.key)}: ${m.completed.count} completed`, href: taskListHref({ ...base, status: ["done"], dateField: "completed", from: monthStart(m.key), to: monthEnd(m.key) }) },
              ],
            }))}
          />
          <div className="mt-4 overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="text-right">Planned</th>
                  <th className="text-right">Completed</th>
                  <th className="text-right">Carried out</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((m) => (
                  <tr key={m.key}>
                    <td>{formatMonth(m.key)}</td>
                    <td className="text-right">
                      <Link className="num-link" href={taskListHref({ ...base, dateField: "planned", from: monthStart(m.key), to: monthEnd(m.key), withMoved: true })}>
                        {m.planned.count}
                      </Link>
                      <span className="text-xs text-muted"> · {m.planned.effort} pts</span>
                    </td>
                    <td className="text-right">
                      <Link className="num-link" href={taskListHref({ ...base, status: ["done"], dateField: "completed", from: monthStart(m.key), to: monthEnd(m.key) })}>
                        {m.completed.count}
                      </Link>
                      <span className="text-xs text-muted"> · {m.completed.effort} pts</span>
                    </td>
                    <td className="text-right">{m.carriedOut}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <section>
          <h2 className="mb-2 flex items-center gap-2 font-bold text-st-overdue">
            <Icon name="alert" size={18} /> Overdue ({overdue.length})
          </h2>
          <TaskList tasks={overdue.slice(0, 15)} members={memberMap} projects={projectMap} today={today} empty="Nothing overdue." />
          {overdue.length > 15 && (
            <Link href={taskListHref({ ...base, overdue: true })} className="mt-2 inline-block text-sm font-semibold text-royal-700 underline">
              See all {overdue.length}
            </Link>
          )}
        </section>
        <section>
          <h2 className="mb-2 flex items-center gap-2 font-bold text-amber-800">
            <Icon name="clock" size={18} /> Due in the next 7 days ({upcoming.length})
          </h2>
          <TaskList tasks={upcoming.slice(0, 15)} members={memberMap} projects={projectMap} today={today} empty="Nothing due in the next week." />
          {upcoming.length > 15 && (
            <Link href={taskListHref({ ...base, upcoming: true })} className="mt-2 inline-block text-sm font-semibold text-royal-700 underline">
              See all {upcoming.length}
            </Link>
          )}
        </section>
      </div>
    </>
  );
}
