import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { ActionItemsEditor } from "@/components/ActionItemsEditor";
import { MeetingSummarizer } from "@/components/MeetingSummarizer";
import { PageHeader } from "@/components/ui";
import { aiEnabled } from "@/lib/ai";
import { requireManager } from "@/lib/auth";
import { getMembers, getProjects } from "@/lib/data";
import { todayIso } from "@/lib/dates";
import { createMeeting } from "../actions";

export const metadata = { title: "Record meeting" };

export default async function NewMeetingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireManager();
  const manual = (await searchParams).manual === "1";
  const [members, projects] = await Promise.all([getMembers(), getProjects()]);

  if (!manual) {
    return (
      <>
        <PageHeader
          title="Record a weekly meeting"
          icon="meeting"
          subtitle="Paste or upload what each person reported. Claude drafts the summary, each person's update, new tasks and progress on existing tasks. Nothing is saved until you review it."
          actions={<Link href="/meetings/new?manual=1" className="btn-ghost btn-sm">Add items by hand instead</Link>}
        />
        <div className="max-w-5xl">
          <MeetingSummarizer members={members} projects={projects} today={todayIso()} enabled={aiEnabled()} />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Record a weekly meeting"
        icon="meeting"
        subtitle="Action items become To Do tasks in the meeting's week (or the following week / backlog)."
        actions={<Link href="/meetings/new" className="btn-ghost btn-sm">Summarize notes with Claude instead</Link>}
      />
      <ActionForm action={createMeeting} className="card max-w-5xl space-y-5 p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
          <div>
            <label htmlFor="m-title">Meeting title</label>
            <input id="m-title" name="title" required maxLength={160} defaultValue="Weekly team meeting" className="mt-1 w-full" />
          </div>
          <div>
            <label htmlFor="m-date">Date</label>
            <input id="m-date" name="meeting_date" type="date" required defaultValue={todayIso()} className="mt-1 w-full" />
          </div>
        </div>
        <div>
          <label htmlFor="m-notes">Notes & decisions</label>
          <textarea id="m-notes" name="notes" rows={5} maxLength={20000} className="mt-1 w-full" placeholder="Key updates, decisions, risks…" />
        </div>
        <div>
          <h2 className="mb-2 text-sm font-bold text-navy-900">Action items</h2>
          <ActionItemsEditor members={members} />
        </div>
        <SubmitButton pendingText="Saving meeting…">Save meeting & create tasks</SubmitButton>
      </ActionForm>
    </>
  );
}
