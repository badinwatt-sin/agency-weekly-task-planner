import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { ActionItemsEditor } from "@/components/ActionItemsEditor";
import { Icon } from "@/components/Icon";
import { TaskList } from "@/components/TaskList";
import { Avatar, Notice, PageHeader, SampleBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getMeeting, getMembers, getProjects, getTasks } from "@/lib/data";
import { formatDate, formatDateTime, formatWeek, todayIso } from "@/lib/dates";
import { sortTasks } from "@/lib/filters";
import { memberName } from "@/lib/types";
import { addActionItems, updateMeetingNotes } from "../actions";

export const metadata = { title: "Meeting" };

export default async function MeetingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const meeting = await getMeeting(id);
  if (!meeting) notFound();
  const [tasks, members, allMembers, projects] = await Promise.all([getTasks(), getMembers(), getMembers(true), getProjects(true)]);
  const memberMap = new Map(allMembers.map((m) => [m.id, m]));
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const today = todayIso();
  const items = sortTasks(tasks.filter((t) => t.meeting_id === meeting.id), today);
  const canEditNotes = user.isManager;
  const n = (k: string) => Number(sp[k] ?? 0) || 0;

  return (
    <>
      <nav className="mb-3 text-sm">
        <Link href="/meetings" className="inline-flex items-center gap-1 font-medium text-royal-700 hover:underline">
          <Icon name="left" size={16} /> All meetings
        </Link>
      </nav>
      <PageHeader
        title={meeting.title}
        icon="meeting"
        subtitle={
          <>
            {formatDate(meeting.meeting_date, { weekday: true, year: true })} · {formatWeek(meeting.week_start)} · recorded by{" "}
            {memberName(meeting.created_by ? memberMap.get(meeting.created_by) : null)} on {formatDateTime(meeting.created_at)} {meeting.is_sample && <SampleBadge />}
          </>
        }
        actions={
          <Link href={`/board?week=${meeting.week_start}`} className="btn-secondary">
            <Icon name="board" size={16} /> Open week on board
          </Link>
        }
      />
      {sp.saved && (
        <div className="mb-4">
          <Notice tone="success">
            Meeting saved
            {sp.made !== undefined ? ` · ${n("made")} new task${n("made") === 1 ? "" : "s"} · ${n("changed")} status change${n("changed") === 1 ? "" : "s"}` : " and action items added to the board"}.
            {n("skipped") > 0 && ` ${n("skipped")} status change${n("skipped") === 1 ? " was" : "s were"} skipped because the task changed after the summary; review ${n("skipped") === 1 ? "it" : "them"} on the board.`}
          </Notice>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-5">
          <section>
            <h2 className="mb-2 font-bold text-navy-900">Action items ({items.length})</h2>
            <TaskList tasks={items} members={memberMap} projects={projectMap} today={today} empty="No action items yet." />
          </section>
          {user.isManager && <section className="card p-4">
            <h2 className="mb-3 font-bold text-navy-900">Add more action items</h2>
            <ActionForm action={addActionItems} className="space-y-3" resetOnSuccess>
              <input type="hidden" name="meeting_id" value={meeting.id} />
              <ActionItemsEditor members={members} initialRows={2} />
              <SubmitButton className="btn-primary btn-sm">Add to board</SubmitButton>
            </ActionForm>
          </section>}
        </div>
        <div className="space-y-5">
        {meeting.people?.length > 0 && (
          <section className="card p-4">
            <h2 className="mb-3 font-bold text-navy-900">Updates by person</h2>
            <ul className="space-y-3">
              {meeting.people.map((p, i) => (
                <li key={p.member_id + i} className="flex gap-3">
                  <Avatar member={memberMap.get(p.member_id)} size="sm" />
                  <div className="min-w-0 text-sm">
                    <div className="font-semibold">{memberName(memberMap.get(p.member_id))}</div>
                    <p className="break-words whitespace-pre-wrap">{p.update}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="card h-fit p-4">
          <h2 className="mb-3 font-bold text-navy-900">{meeting.source === "claude" ? "Summary, notes & decisions" : "Notes & decisions"}</h2>
          {canEditNotes ? (
            <ActionForm action={updateMeetingNotes} className="space-y-3">
              <input type="hidden" name="id" value={meeting.id} />
              <input name="title" defaultValue={meeting.title} required maxLength={160} aria-label="Title" className="w-full" />
              <input name="meeting_date" type="date" defaultValue={meeting.meeting_date} required aria-label="Date" className="w-full" />
              <textarea name="notes" rows={12} defaultValue={meeting.notes ?? ""} maxLength={20000} aria-label="Notes" className="w-full" />
              <SubmitButton className="btn-secondary btn-sm">Save notes</SubmitButton>
            </ActionForm>
          ) : (
            <p className="text-sm whitespace-pre-wrap">{meeting.notes || <span className="text-muted">No notes recorded.</span>}</p>
          )}
        </section>
        </div>
      </div>
    </>
  );
}
