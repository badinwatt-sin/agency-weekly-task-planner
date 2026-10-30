import Link from "next/link";
import { formatDate, formatWeekShort } from "@/lib/dates";
import { isOverdue } from "@/lib/filters";
import { memberName, type Member, type Project, type Task } from "@/lib/types";
import { Icon } from "./Icon";
import { Avatar, DueBadge, EmptyState, PriorityBadge, ProjectTag, SampleBadge, StatusBadge } from "./ui";

/** Responsive task list: table on wide screens, stacked cards on phones. */
export function TaskList({ tasks, members, projects, today, empty = "No tasks match these filters." }: { tasks: Task[]; members: Map<string, Member>; projects: Map<string, Project>; today: string; empty?: string }) {
  if (!tasks.length) return <EmptyState title={empty} />;
  return (
    <>
      <div className="card hidden overflow-x-auto md:block">
        <table className="table">
          <thead>
            <tr>
              <th>Task</th>
              <th>Owner</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Week</th>
              <th>Due</th>
              <th className="text-right">Effort</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id} className={isOverdue(t, today) ? "bg-red-50/40" : ""}>
                <td className="max-w-md">
                  <Link href={`/tasks/${t.id}`} className="font-semibold text-navy-900 hover:text-royal-600 hover:underline">
                    {t.title}
                  </Link>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    <ProjectTag project={t.project_id ? projects.get(t.project_id) : undefined} />
                    {t.carry_over_count > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted">
                        <Icon name="carry" size={12} /> carried ×{t.carry_over_count}
                      </span>
                    )}
                    {t.is_sample && <SampleBadge />}
                  </div>
                </td>
                <td>
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <Avatar member={t.owner_id ? members.get(t.owner_id) : null} size="sm" />
                    {memberName(t.owner_id ? members.get(t.owner_id) : null)}
                  </span>
                </td>
                <td>
                  <StatusBadge status={t.status} />
                  {t.completed_on && <div className="mt-0.5 text-xs text-muted">on {formatDate(t.completed_on)}</div>}
                </td>
                <td>
                  <PriorityBadge priority={t.priority} />
                </td>
                <td className="whitespace-nowrap text-muted">{t.planned_week ? formatWeekShort(t.planned_week) : "—"}</td>
                <td className="whitespace-nowrap">{t.due_date ? <DueBadge task={t} today={today} /> : <span className="text-muted">—</span>}</td>
                <td className="text-right text-muted">{t.effort_points ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-2 md:hidden">
        {tasks.map((t) => (
          <li key={t.id}>
            <Link href={`/tasks/${t.id}`} className={`card block p-3 ${isOverdue(t, today) ? "border-red-200" : ""}`}>
              <div className="flex items-start gap-2">
                <span className="min-w-0 flex-1 font-semibold text-navy-900">{t.title}</span>
                <StatusBadge status={t.status} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <PriorityBadge priority={t.priority} />
                <DueBadge task={t} today={today} />
                {t.is_sample && <SampleBadge />}
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted">
                <span className="flex items-center gap-1.5">
                  <Avatar member={t.owner_id ? members.get(t.owner_id) : null} size="sm" />
                  {memberName(t.owner_id ? members.get(t.owner_id) : null)}
                </span>
                <ProjectTag project={t.project_id ? projects.get(t.project_id) : undefined} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
