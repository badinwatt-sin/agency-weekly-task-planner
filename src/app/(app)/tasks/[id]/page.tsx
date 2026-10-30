import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Icon } from "@/components/Icon";
import { TaskForm } from "@/components/TaskForm";
import { Avatar, DueBadge, Notice, PriorityBadge, SampleBadge, StatusBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getMeeting, getMembers, getProjects, getTask, getTaskHistory, type ActivityRow } from "@/lib/data";
import { formatDate, formatDateTime, formatWeek, todayIso, weekStart } from "@/lib/dates";
import { canEditTask, memberName, PRIORITY_LABEL, STATUS_LABEL, type Member, type Priority, type Project, type TaskStatus } from "@/lib/types";
import { addTaskUpdate, archiveTask, carryTaskForward } from "../actions";

export const metadata = { title: "Task" };

const FIELD_LABEL: Record<string, string> = {
  title: "Title", description: "Description", project_id: "Project", owner_id: "Owner", status: "Status", priority: "Priority",
  planned_week: "Planned week", start_date: "Start date", due_date: "Due date", completed_on: "Completion date",
  effort_points: "Effort", notes: "Notes", links: "Links", meeting_id: "Meeting", archived_at: "Archived", is_sample: "Sample flag",
};

function describeValue(field: string, v: unknown, members: Map<string, Member>, projects: Map<string, Project>): string {
  if (v === null || v === undefined || v === "") return "—";
  switch (field) {
    case "owner_id":
      return memberName(members.get(String(v)));
    case "project_id":
      return projects.get(String(v))?.name ?? "removed project";
    case "status":
      return STATUS_LABEL[v as TaskStatus] ?? String(v);
    case "priority":
      return PRIORITY_LABEL[v as Priority] ?? String(v);
    case "planned_week":
      return formatWeek(String(v));
    case "start_date":
    case "due_date":
    case "completed_on":
      return formatDate(String(v), { year: true });
    case "effort_points":
      return `${v} pts`;
    default:
      return "";
  }
}

function ActivityItem({ row, members, projects }: { row: ActivityRow; members: Map<string, Member>; projects: Map<string, Project> }) {
  const who = memberName(row.actor_id ? members.get(row.actor_id) : null);
  let text: React.ReactNode;
  if (row.action === "created") text = "created the task";
  else if (row.action === "supporter_added" || row.action === "supporter_removed") {
    const m = members.get(String((row.changes as { member_id?: string }).member_id));
    text = `${row.action === "supporter_added" ? "added" : "removed"} supporting member ${memberName(m)}`;
  } else {
    const entries = Object.entries(row.changes as Record<string, { from: unknown; to: unknown }>).filter(([k]) => k in FIELD_LABEL);
    text = (
      <>
        {row.action === "carried_over" ? "carried the task over" : row.action === "archived" ? "archived the task" : "updated"}
        <ul className="mt-1 space-y-0.5 text-xs text-muted">
          {entries.map(([k, c]) => {
            const from = describeValue(k, c.from, members, projects);
            const to = describeValue(k, c.to, members, projects);
            return (
              <li key={k}>
                <span className="font-medium text-ink">{FIELD_LABEL[k]}</span>
                {from || to ? (
                  <>
                    : {from} <span aria-hidden>→</span>
                    <span className="sr-only">to</span> {to}
                  </>
                ) : (
                  " changed"
                )}
              </li>
            );
          })}
        </ul>
      </>
    );
  }
  return (
    <li className="flex gap-3">
      <Avatar member={row.actor_id ? members.get(row.actor_id) : null} size="sm" />
      <div className="min-w-0 flex-1 text-sm">
        <span className="font-semibold">{who}</span> {text}
        <div className="text-xs text-muted">{formatDateTime(row.created_at)}</div>
      </div>
    </li>
  );
}

export default async function TaskPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const task = await getTask(id);
  if (!task) notFound();

  const [members, allMembers, projects, history, meeting] = await Promise.all([
    getMembers(),
    getMembers(true),
    getProjects(true),
    getTaskHistory(id),
    task.meeting_id ? getMeeting(task.meeting_id) : Promise.resolve(null),
  ]);
  const memberMap = new Map(allMembers.map((m) => [m.id, m]));
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const today = todayIso();
  const editable = canEditTask(task, user) && !task.archived_at;

  return (
    <>
      <nav className="mb-3 text-sm">
        <Link href={task.planned_week ? `/board?week=${task.planned_week}` : "/board"} className="inline-flex items-center gap-1 font-medium text-royal-700 hover:underline">
          <Icon name="left" size={16} /> Back to board
        </Link>
      </nav>

      <header className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={task.status} />
          <PriorityBadge priority={task.priority} />
          <DueBadge task={task} today={today} />
          {task.is_sample && <SampleBadge />}
          {task.carry_over_count > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
              <Icon name="carry" size={12} /> Carried over ×{task.carry_over_count}
            </span>
          )}
        </div>
        <h1 className="mt-2 text-xl font-bold text-navy-900 sm:text-2xl">{task.title}</h1>
        <p className="mt-1 text-sm text-muted">
          Created by {memberName(task.created_by ? memberMap.get(task.created_by) : null)} · {formatDateTime(task.created_at)} · last updated{" "}
          {formatDateTime(task.updated_at)} by {memberName(task.updated_by ? memberMap.get(task.updated_by) : null)}
          {meeting && (
            <>
              {" "}
              · from <Link href={`/meetings/${meeting.id}`} className="font-medium text-royal-700 underline">{meeting.title}</Link>
            </>
          )}
        </p>
      </header>

      {sp.created && (
        <div className="mb-4">
          <Notice tone="success">Task created.</Notice>
        </div>
      )}
      {task.archived_at && (
        <div className="mb-4">
          <Notice tone="warn">This task was archived on {formatDateTime(task.archived_at)} and no longer appears on boards or reports.</Notice>
        </div>
      )}
      {!editable && !task.archived_at && (
        <div className="mb-4">
          <Notice>View only. The Manager keeps tasks up to date in this planner.</Notice>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="card p-4 sm:p-6" aria-label="Task details">
          <TaskForm task={task} members={members.concat(allMembers.filter((m) => !m.is_active))} projects={projects} thisWeek={weekStart(today)} readOnly={!editable} />
          {task.links.length > 0 && (
            <div className="mt-5 border-t border-line pt-4">
              <h2 className="mb-2 text-sm font-bold text-navy-900">Open links</h2>
              <ul className="space-y-1">
                {task.links.map((l, i) => (
                  <li key={i}>
                    <a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1.5 text-sm font-medium break-all text-royal-700 hover:underline">
                      <Icon name="link" size={14} /> {l.label || l.url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <aside className="space-y-5">
          {editable && (
            <div className="card space-y-3 p-4">
              <h2 className="text-sm font-bold text-navy-900">Quick actions</h2>
              {task.status !== "done" && (
                <ActionForm action={carryTaskForward}>
                  <input type="hidden" name="id" value={task.id} />
                  <input type="hidden" name="version" value={task.version} />
                  <SubmitButton className="btn-secondary btn-sm w-full">
                    <Icon name="carry" size={14} /> Carry to {task.planned_week ? "following week" : "next week"}
                  </SubmitButton>
                </ActionForm>
              )}
              {user.isManager && (
                <ActionForm action={archiveTask} confirmText="Archive this task? It will be hidden from boards and reports but kept in exports.">
                  <input type="hidden" name="id" value={task.id} />
                  <input type="hidden" name="version" value={task.version} />
                  <SubmitButton className="btn-danger btn-sm w-full">
                    <Icon name="archive" size={14} /> Archive task
                  </SubmitButton>
                </ActionForm>
              )}
            </div>
          )}

          <div className="card p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-navy-900">
              <Icon name="message" size={16} /> Progress updates & comments
            </h2>
            {user.isManager && !task.archived_at && (
              <ActionForm action={addTaskUpdate} className="mb-4 space-y-2" resetOnSuccess>
                <input type="hidden" name="task_id" value={task.id} />
                <textarea name="body" rows={3} maxLength={4000} required placeholder="Share progress, blockers or a question…" aria-label="Update" className="w-full" />
                <div className="flex items-center gap-2">
                  <select name="kind" aria-label="Type" defaultValue="progress" className="flex-1">
                    <option value="progress">Progress update</option>
                    <option value="comment">Comment</option>
                  </select>
                  <SubmitButton className="btn-primary btn-sm" pendingText="Posting…">
                    Post
                  </SubmitButton>
                </div>
              </ActionForm>
            )}
            {history.updates.length === 0 ? (
              <p className="text-sm text-muted">No updates yet.</p>
            ) : (
              <ul className="space-y-4">
                {history.updates.map((u) => (
                  <li key={u.id} className="flex gap-3">
                    <Avatar member={u.author_id ? memberMap.get(u.author_id) : null} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-muted">
                        <span className="font-semibold text-ink">{memberName(u.author_id ? memberMap.get(u.author_id) : null)}</span> ·{" "}
                        {u.kind === "progress" ? "Progress" : "Comment"} · {formatDateTime(u.created_at)}
                      </div>
                      <p className="mt-1 text-sm break-words whitespace-pre-wrap">{u.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {history.moves.length > 0 && (
            <div className="card p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-navy-900">
                <Icon name="carry" size={16} /> Week history
              </h2>
              <ol className="space-y-2 text-sm">
                {history.moves.map((m, i) => (
                  <li key={i}>
                    <span className="font-medium">{formatWeek(m.from_week)}</span>
                    <span className="text-muted"> → {m.to_week ? formatWeek(m.to_week) : "unscheduled"}</span>
                    <div className="text-xs text-muted">
                      was {STATUS_LABEL[m.status_at_move]} · moved {formatDateTime(m.moved_at)}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="card p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-navy-900">
              <Icon name="history" size={16} /> Activity history
            </h2>
            <ul className="space-y-4">
              {history.activity.map((a) => (
                <ActivityItem key={a.id} row={a} members={memberMap} projects={projectMap} />
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </>
  );
}
