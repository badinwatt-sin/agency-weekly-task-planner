import Link from "next/link";
import { FilterBar } from "@/components/FilterBar";
import { Icon } from "@/components/Icon";
import { KanbanBoard } from "@/components/KanbanBoard";
import { Notice, PageHeader } from "@/components/ui";
import { WeekPicker } from "@/components/WeekPicker";
import { requireUser } from "@/lib/auth";
import { getMembers, getProjects, getTasks } from "@/lib/data";
import { addDays, isIsoDate, isMonday, todayIso, weekStart } from "@/lib/dates";
import { filterTasks, isOverdue, isUpcoming, parseFilters, taskListHref } from "@/lib/filters";

export const metadata = { title: "Weekly board" };

export default async function BoardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const today = todayIso();
  const thisWeek = weekStart(today);
  const rawWeek = typeof sp.week === "string" ? sp.week : undefined;
  const rawDate = typeof sp.date === "string" ? sp.date : undefined;
  const week = rawWeek && isMonday(rawWeek) ? rawWeek : rawDate && isIsoDate(rawDate) ? weekStart(rawDate) : thisWeek;

  const { status: _ignored, ...filters } = parseFilters(sp);
  const [tasks, members, allMembers, projects] = await Promise.all([getTasks(), getMembers(), getMembers(true), getProjects(true)]);

  const visible = filterTasks(tasks, filters, today);
  const boardTasks = visible.filter((t) => t.status === "backlog" || t.planned_week === week);
  const unfinishedInWeek = tasks.filter((t) => t.planned_week === week && (t.status === "todo" || t.status === "doing")).length;
  const leftBehind = tasks.filter((t) => t.planned_week && t.planned_week < week && (t.status === "todo" || t.status === "doing"));
  const overdue = boardTasks.filter((t) => isOverdue(t, today)).length;
  const upcoming = tasks.filter((t) => isUpcoming(t, today)).length;

  return (
    <>
      <PageHeader
        title="Weekly board"
        icon="board"
        subtitle={user.isManager ? "Plan the week after the team meeting. Drag cards with the grip handle, or use Move on each card." : "What the team is working on this week. Open any card for details."}
        actions={
          user.isManager && <>
            <Link href="/meetings/new" className="btn-secondary hidden lg:inline-flex">
              <Icon name="meeting" size={16} /> Record meeting
            </Link>
            <Link href={`/tasks/new?week=${week}`} className="btn-primary hidden lg:inline-flex">
              <Icon name="plus" size={16} /> New task
            </Link>
          </>
        }
      />

      {sp.welcome && (
        <div className="mb-4">
          <Notice tone="success">Welcome! Your password is set. This board is shared by the whole team.</Notice>
        </div>
      )}
      {sp.denied && (
        <div className="mb-4">
          <Notice tone="warn">That page is only available to the Manager.</Notice>
        </div>
      )}
      {sp.archived && (
        <div className="mb-4">
          <Notice tone="success">Task archived.</Notice>
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <WeekPicker path="/board" week={week} thisWeek={thisWeek} keep={{ q: filters.q, owner: filters.owner, project: filters.project, priority: filters.priority }} />
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href={taskListHref({ overdue: true })} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold ${overdue ? "bg-red-50 text-st-overdue" : "bg-white text-muted"}`}>
            <Icon name="alert" size={14} /> {tasks.filter((t) => isOverdue(t, today)).length} overdue
          </Link>
          <Link href={taskListHref({ upcoming: true })} className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 font-semibold text-amber-800">
            <Icon name="clock" size={14} /> {upcoming} due in 7 days
          </Link>
        </div>
      </div>

      <FilterBar path="/board" filters={filters} members={members} projects={projects.filter((p) => p.is_active)} fields={["q", "owner", "project", "priority"]} keep={{ week }} />

      {leftBehind.length > 0 && (
        <div className="mb-4">
          <Notice tone="warn">
            {leftBehind.length} unfinished task{leftBehind.length === 1 ? " is" : "s are"} still planned for earlier weeks.{" "}
            <Link
              className="font-semibold underline"
              href={taskListHref({ status: ["todo", "doing"], dateField: "planned", to: addDays(week, -1) })}
            >
              Review them
            </Link>{" "}
            and carry forward what's still relevant.
          </Notice>
        </div>
      )}

      <KanbanBoard tasks={boardTasks} members={allMembers} projects={projects} user={user} week={week} today={today} unfinishedInWeek={unfinishedInWeek} />
    </>
  );
}
