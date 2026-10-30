import { TaskForm } from "@/components/TaskForm";
import { PageHeader } from "@/components/ui";
import { requireManager } from "@/lib/auth";
import { getMembers, getProjects } from "@/lib/data";
import { isMonday, todayIso, weekStart } from "@/lib/dates";
import { STATUSES, type TaskStatus } from "@/lib/types";

export const metadata = { title: "New task" };

export default async function NewTaskPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireManager();
  const sp = await searchParams;
  const [members, projects] = await Promise.all([getMembers(), getProjects()]);
  const thisWeek = weekStart(todayIso());
  const status = (STATUSES as string[]).includes(sp.status ?? "") ? (sp.status as TaskStatus) : "todo";
  const week = sp.week && isMonday(sp.week) ? sp.week : thisWeek;
  return (
    <>
      <PageHeader title="New task" icon="plus" subtitle="Add work agreed in the weekly meeting or anything new that comes up." />
      <div className="card max-w-4xl p-4 sm:p-6">
        <TaskForm
          members={members}
          projects={projects}
          thisWeek={thisWeek}
          defaults={{ status, planned_week: status === "backlog" ? null : week, owner_id: user.member.id }}
        />
      </div>
    </>
  );
}
