import Link from "next/link";
import { Icon } from "@/components/Icon";
import { EmptyState, PageHeader, SampleBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getMeetings, getMembers, getTasks } from "@/lib/data";
import { formatDate, formatWeek } from "@/lib/dates";
import { memberName } from "@/lib/types";

export const metadata = { title: "Meetings" };

export default async function MeetingsPage() {
  const user = await requireUser();
  const [meetings, tasks, members] = await Promise.all([getMeetings(), getTasks(), getMembers(true)]);
  const memberMap = new Map(members.map((m) => [m.id, m]));
  return (
    <>
      <PageHeader
        title="Weekly meetings"
        icon="meeting"
        subtitle="Record what was agreed and turn action items straight into tasks on the board."
        actions={
          user.isManager && (
            <Link href="/meetings/new" className="btn-primary">
              <Icon name="plus" size={16} /> Record a meeting
            </Link>
          )
        }
      />
      {meetings.length === 0 ? (
        <EmptyState title="No meetings recorded yet">Record your next weekly meeting to capture action items for the board.</EmptyState>
      ) : (
        <ul className="card divide-y divide-line">
          {meetings.map((m) => {
            const items = tasks.filter((t) => t.meeting_id === m.id);
            const done = items.filter((t) => t.status === "done").length;
            return (
              <li key={m.id}>
                <Link href={`/meetings/${m.id}`} className="flex flex-col gap-1 p-4 hover:bg-royal-50/50 sm:flex-row sm:items-center sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 font-semibold text-navy-900">
                      {m.title} {m.is_sample && <SampleBadge />}
                    </div>
                    <div className="text-xs text-muted">
                      {formatDate(m.meeting_date, { weekday: true, year: true })} · {formatWeek(m.week_start)} · recorded by {memberName(m.created_by ? memberMap.get(m.created_by) : null)}
                    </div>
                  </div>
                  <div className="text-sm text-muted">
                    <strong className="text-ink">{items.length}</strong> action items · {done} done
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
