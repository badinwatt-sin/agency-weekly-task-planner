import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { TaskList } from "@/components/TaskList";
import { Avatar, PageHeader, SampleBadge, Stat, StatusBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getMembers, getProjects, getTasks } from "@/lib/data";
import { formatWeekShort, todayIso, weekStart } from "@/lib/dates";
import { isOverdue, isUpcoming, sortTasks, taskListHref } from "@/lib/filters";
import { measure, personWeeklyLoad } from "@/lib/stats";
import { memberName, STATUSES, type TaskStatus } from "@/lib/types";

export const metadata = { title: "People" };

export default async function PeoplePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser();
  const sp = await searchParams;
  const [tasks, members, allMembers, projects] = await Promise.all([getTasks(), getMembers(), getMembers(true), getProjects(true)]);
  const today = todayIso();
  const thisWeek = weekStart(today);
  const memberMap = new Map(allMembers.map((m) => [m.id, m]));
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  const selected = sp.member ? memberMap.get(sp.member) : undefined;
  if (sp.member && !selected) notFound();

  if (!selected) {
    return (
      <>
        <PageHeader title="People" icon="users" subtitle="Each person's current tasks, deadlines and planned workload. Select someone for details." />
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {members.map((m) => {
            const mine = tasks.filter((t) => t.owner_id === m.id);
            const open = mine.filter((t) => t.status === "todo" || t.status === "doing");
            const o = measure(open);
            const overdue = mine.filter((t) => isOverdue(t, today)).length;
            const dueSoon = mine.filter((t) => isUpcoming(t, today)).length;
            const supporting = tasks.filter((t) => t.supporter_ids.includes(m.id) && t.status !== "done").length;
            return (
              <li key={m.id}>
                <Link href={`/people?member=${m.id}`} className="card block p-4 transition hover:border-royal-500 hover:shadow-sm">
                  <div className="flex items-center gap-3">
                    <Avatar member={m} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 truncate font-semibold text-navy-900">
                        {memberName(m)} {m.is_sample && <SampleBadge />}
                      </div>
                      <div className="text-xs text-muted">{m.role === "manager" ? "Manager" : "Team member"}</div>
                    </div>
                    <Icon name="right" size={16} className="text-muted" />
                  </div>
                  <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
                    <div>
                      <dt className="text-[10px] font-semibold text-muted uppercase">Open</dt>
                      <dd className="font-bold text-navy-900">{o.count}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-semibold text-muted uppercase">Effort</dt>
                      <dd className="font-bold text-navy-900">{o.effort}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-semibold text-muted uppercase">Overdue</dt>
                      <dd className={`font-bold ${overdue ? "text-st-overdue" : "text-navy-900"}`}>{overdue}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-semibold text-muted uppercase">Due 7d</dt>
                      <dd className="font-bold text-navy-900">{dueSoon}</dd>
                    </div>
                  </dl>
                  {supporting > 0 && <p className="mt-2 text-xs text-muted">Also supporting {supporting} open task{supporting === 1 ? "" : "s"}</p>}
                </Link>
              </li>
            );
          })}
        </ul>
      </>
    );
  }

  const mine = tasks.filter((t) => t.owner_id === selected.id);
  const supporting = tasks.filter((t) => t.supporter_ids.includes(selected.id) && t.status !== "done");
  const load = personWeeklyLoad(tasks, selected.id, today);
  const maxLoad = Math.max(1, ...load.map((l) => l.open.count));
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, mine.filter((t) => t.status === s)])) as Record<TaskStatus, typeof mine>;
  const deadlines = sortTasks(mine.filter((t) => t.status !== "done" && t.due_date), today).slice(0, 10);

  return (
    <>
      <nav className="mb-3 text-sm">
        <Link href="/people" className="inline-flex items-center gap-1 font-medium text-royal-700 hover:underline">
          <Icon name="left" size={16} /> All people
        </Link>
      </nav>
      <PageHeader
        title={memberName(selected)}
        subtitle={selected.display_name ? selected.full_name : selected.role === "manager" ? "Manager" : "Team member"}
        actions={
          <Link href={taskListHref({ owner: selected.id })} className="btn-secondary">
            <Icon name="list" size={16} /> All their tasks
          </Link>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Open (To Do + Doing)" value={byStatus.todo.length + byStatus.doing.length} sub={`${measure([...byStatus.todo, ...byStatus.doing]).effort} effort pts`} href={taskListHref({ owner: selected.id, status: ["todo", "doing"] })} />
        <Stat label="Overdue" tone="overdue" value={mine.filter((t) => isOverdue(t, today)).length} href={taskListHref({ owner: selected.id, overdue: true })} />
        <Stat label="Backlog" tone="backlog" value={byStatus.backlog.length} href={taskListHref({ owner: selected.id, status: ["backlog"] })} />
        <Stat label="Done (all time)" tone="done" value={byStatus.done.length} href={taskListHref({ owner: selected.id, status: ["done"] })} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          {(["doing", "todo", "backlog"] as TaskStatus[]).map((s) => (
            <section key={s}>
              <h2 className="mb-2 flex items-center gap-2 font-bold text-navy-900">
                <StatusBadge status={s} /> <span className="text-sm text-muted">{byStatus[s].length}</span>
              </h2>
              <TaskList tasks={sortTasks(byStatus[s], today)} members={memberMap} projects={projectMap} today={today} empty="Nothing here." />
            </section>
          ))}
          {supporting.length > 0 && (
            <section>
              <h2 className="mb-2 font-bold text-navy-900">Supporting others ({supporting.length})</h2>
              <TaskList tasks={sortTasks(supporting, today)} members={memberMap} projects={projectMap} today={today} />
            </section>
          )}
        </div>

        <aside className="space-y-5">
          <section className="card p-4">
            <h2 className="font-bold text-navy-900">Planned workload — next 6 weeks</h2>
            <p className="mb-3 text-xs text-muted">Open tasks they own per planned week, with estimated effort.</p>
            <ul className="space-y-2">
              {load.map((l) => (
                <li key={l.week} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2 text-sm">
                  <Link href={`/board?week=${l.week}&owner=${selected.id}`} className="text-xs font-medium text-royal-700 hover:underline">
                    {formatWeekShort(l.week)}
                    {l.week === thisWeek && " •"}
                  </Link>
                  <span className="h-3 rounded bg-canvas">
                    <span className="block h-3 rounded bg-royal-600" style={{ width: `${(l.open.count / maxLoad) * 100}%` }} />
                  </span>
                  <span className="w-24 text-right text-xs text-muted">
                    <strong className="text-ink">{l.open.count}</strong> tasks · {l.open.effort} pts{l.supporting ? ` · +${l.supporting} sup.` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section className="card p-4">
            <h2 className="mb-3 font-bold text-navy-900">Upcoming deadlines</h2>
            {deadlines.length === 0 ? (
              <p className="text-sm text-muted">No open tasks with due dates.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {deadlines.map((t) => (
                  <li key={t.id} className="flex items-start justify-between gap-2">
                    <Link href={`/tasks/${t.id}`} className="min-w-0 font-medium hover:text-royal-600 hover:underline">
                      {t.title}
                    </Link>
                    <span className={`shrink-0 text-xs font-semibold ${isOverdue(t, today) ? "text-st-overdue" : "text-muted"}`}>{t.due_date}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
