"use client";

import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { carryWeekForward, moveTask } from "@/app/(app)/tasks/actions";
import { formatWeek } from "@/lib/dates";
import { isOverdue } from "@/lib/filters";
import { getBrowserClient } from "@/lib/supabase/browser";
import { canEditTask, memberName, STATUSES, STATUS_HINT, STATUS_LABEL, type CurrentUser, type Member, type Project, type Task, type TaskStatus } from "@/lib/types";
import { ActionSheet, type SheetItem } from "./ActionSheet";
import { Icon } from "./Icon";
import { Avatar, DueBadge, PriorityBadge, ProjectTag, SampleBadge, STATUS_STYLE } from "./ui";

interface Props {
  tasks: Task[];
  members: Member[];
  projects: Project[];
  user: CurrentUser;
  week: string;
  today: string;
  unfinishedInWeek: number;
}

export function KanbanBoard({ tasks: initial, members, projects, user, week, today, unfinishedInWeek }: Props) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initial);
  const [dragging, setDragging] = useState<Task | null>(null);
  const [mobileCol, setMobileCol] = useState<TaskStatus>("todo");
  const [sheetFor, setSheetFor] = useState<Task | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "warn" | "success"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Server data wins whenever the page re-renders (after saves or live updates).
  useEffect(() => setTasks(initial), [initial]);

  // Live updates: refresh when anyone changes a task.
  useEffect(() => {
    const supabase = getBrowserClient();
    const channel = supabase
      .channel("tasks-board")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => {
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(() => router.refresh(), 600);
      })
      .subscribe();
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      supabase.removeChannel(channel);
    };
  }, [router]);

  const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const columns = useMemo(() => {
    const by: Record<TaskStatus, Task[]> = { backlog: [], todo: [], doing: [], done: [] };
    for (const t of tasks) by[t.status].push(t);
    return by;
  }, [tasks]);

  async function move(task: Task, status: TaskStatus) {
    if (task.status === status) return;
    if (!canEditTask(task, user)) {
      setMessage({ tone: "warn", text: "You can only move tasks you own, created or support." });
      return;
    }
    const before = tasks;
    const plannedWeek = status === "backlog" ? task.planned_week : (task.status === "backlog" ? week : task.planned_week ?? week);
    setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, status, planned_week: plannedWeek, completed_on: status === "done" ? today : null } : t)));
    setMessage(null);
    const res = await moveTask({ id: task.id, version: task.version, status, plannedWeek });
    if (!res.ok) {
      setTasks(before);
      setMessage({ tone: res.conflict ? "warn" : "error", text: res.error });
      router.refresh();
      return;
    }
    setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, version: res.data.version } : t)));
  }

  function onDragStart(e: DragStartEvent) {
    setDragging(tasks.find((t) => t.id === e.active.id) ?? null);
  }

  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    const task = tasks.find((t) => t.id === e.active.id);
    const target = e.over?.id as TaskStatus | undefined;
    if (task && target && STATUSES.includes(target)) void move(task, target);
  }

  function carryAll() {
    if (!window.confirm(`Move ${unfinishedInWeek} unfinished To Do / Doing task(s) from ${formatWeek(week)} to the following week? Their history is kept.`)) return;
    startTransition(async () => {
      const res = await carryWeekForward(week);
      setMessage(res.ok ? { tone: "success", text: `${res.data.moved} task(s) carried over to next week.` } : { tone: "error", text: res.error });
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2" aria-live="polite">
        {message && (
          <div
            role={message.tone === "error" ? "alert" : "status"}
            className={`flex flex-1 items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
              message.tone === "error" ? "border-red-200 bg-red-50 text-red-800" : message.tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"
            }`}
          >
            <span className="flex-1">{message.text}</span>
            <button onClick={() => setMessage(null)} aria-label="Dismiss" className="opacity-70 hover:opacity-100">
              <Icon name="x" size={16} />
            </button>
          </div>
        )}
        {user.isManager && unfinishedInWeek > 0 && (
          <button onClick={carryAll} disabled={isPending} className="btn-secondary btn-sm ml-auto">
            <Icon name="carry" size={14} /> {isPending ? "Carrying over…" : `Carry ${unfinishedInWeek} unfinished to next week`}
          </button>
        )}
      </div>

      {/* Phones: one column at a time, picked with a segmented control */}
      <div role="group" aria-label="Column" className="sticky top-[calc(env(safe-area-inset-top)+56px)] z-10 mb-3 flex gap-1 rounded-xl bg-canvas p-1 shadow-[0_0_0_6px_var(--color-canvas)] md:hidden">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={mobileCol === s}
            onClick={() => setMobileCol(s)}
            className={`flex flex-1 flex-col items-center rounded-lg py-1.5 text-xs font-semibold ${mobileCol === s ? "bg-white text-navy-900 shadow-sm" : "text-muted"}`}
          >
            <span className={`text-base tabular-nums ${mobileCol === s ? STATUS_STYLE[s].text : ""}`}>{columns[s].length}</span>
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
        <div className="flex flex-col gap-3 md:-mx-6 md:snap-x md:snap-mandatory md:flex-row md:overflow-x-auto md:px-6 md:pb-3 lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0">
          {STATUSES.map((s) => (
            <Column key={s} status={s} week={week} count={columns[s].length} effort={columns[s].reduce((a, t) => a + (t.effort_points ?? 0), 0)} canAdd={user.isManager} phoneVisible={mobileCol === s}>
              {columns[s].map((t) => (
                <Card key={t.id} task={t} owner={t.owner_id ? memberMap.get(t.owner_id) : undefined} project={t.project_id ? projectMap.get(t.project_id) : undefined} today={today} editable={canEditTask(t, user)} onMove={(st) => void move(t, st)} onMoveSheet={() => setSheetFor(t)} />
              ))}
            </Column>
          ))}
        </div>
        <DragOverlay>
          {dragging && (
            <div className="rotate-1 shadow-xl">
              <Card task={dragging} owner={dragging.owner_id ? memberMap.get(dragging.owner_id) : undefined} project={dragging.project_id ? projectMap.get(dragging.project_id) : undefined} today={today} editable overlay />
            </div>
          )}
        </DragOverlay>
      </DndContext>
      {sheetFor && (
        <ActionSheet
          title={`Move “${sheetFor.title}”`}
          onClose={() => setSheetFor(null)}
          items={STATUSES.map<SheetItem>((s) => ({ label: STATUS_LABEL[s], sub: STATUS_HINT[s], dot: STATUS_STYLE[s].bar, current: sheetFor.status === s, onSelect: () => void move(sheetFor, s) }))}
        />
      )}
    </div>
  );
}

function Column({ status, week, count, effort, canAdd, phoneVisible, children }: { status: TaskStatus; week: string; count: number; effort: number; canAdd: boolean; phoneVisible: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      aria-label={`${STATUS_LABEL[status]} column`}
      className={`${phoneVisible ? "flex" : "hidden"} w-full flex-col md:flex md:w-80 md:shrink-0 md:snap-start md:rounded-xl md:border-t-4 md:bg-white/70 md:p-2 md:ring-1 md:ring-line lg:w-auto ${STATUS_STYLE[status].column} ${isOver ? "bg-royal-50 ring-2 ring-royal-500" : ""}`}
    >
      <header className="hidden items-center gap-2 px-2 pt-1 pb-2 md:flex">
        <h2 className="font-bold text-navy-900">{STATUS_LABEL[status]}</h2>
        <span className="rounded-full bg-canvas px-2 text-xs font-semibold text-muted">{count}</span>
        {effort > 0 && <span className="text-xs text-muted">· {effort} pts</span>}
        {canAdd && (
          <Link href={`/tasks/new?status=${status}&week=${week}`} className="ml-auto rounded p-1 text-muted hover:bg-royal-50 hover:text-royal-700" aria-label={`Add task to ${STATUS_LABEL[status]}`}>
            <Icon name="plus" size={16} />
          </Link>
        )}
      </header>
      <p className="hidden px-2 pb-2 text-xs text-muted md:block">{STATUS_HINT[status]}</p>
      <div className="flex min-h-24 flex-1 flex-col gap-2.5 md:gap-2">
        {children}
        {count === 0 && <p className="px-2 py-6 text-center text-sm text-muted md:py-2 md:text-left md:text-xs">No tasks in {STATUS_LABEL[status]}{status === "backlog" ? "" : " this week"}.</p>}
      </div>
    </section>
  );
}

function Card({
  task, owner, project, today, editable, onMove, onMoveSheet, overlay = false,
}: {
  task: Task; owner?: Member; project?: Project; today: string; editable: boolean; onMove?: (s: TaskStatus) => void; onMoveSheet?: () => void; overlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, disabled: !editable || overlay });
  const overdue = isOverdue(task, today);
  return (
    <article
      ref={overlay ? undefined : setNodeRef}
      className={`rounded-xl border bg-white p-3.5 shadow-xs md:rounded-lg md:p-3 ${overdue ? "border-red-300" : "border-line"} ${isDragging ? "opacity-40" : ""}`}
    >
      <div className="flex items-start gap-2">
        {editable && (
          <button
            {...listeners}
            {...attributes}
            aria-label={`Drag “${task.title}” to another column`}
            className="-ml-1 hidden cursor-grab touch-none rounded p-0.5 text-slate-400 hover:bg-canvas hover:text-navy-800 active:cursor-grabbing md:block"
          >
            <Icon name="grip" size={16} />
          </button>
        )}
        <Link href={`/tasks/${task.id}`} className="min-w-0 flex-1 text-base leading-snug font-semibold text-navy-900 hover:text-royal-600 md:text-sm">
          {task.title}
        </Link>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <PriorityBadge priority={task.priority} />
        {task.is_sample && <SampleBadge />}
        {task.carry_over_count > 0 && (
          <span title="Carried over from an earlier week" className="inline-flex items-center gap-0.5 text-xs text-muted">
            <Icon name="carry" size={12} />×{task.carry_over_count}
          </span>
        )}
        {task.effort_points != null && <span className="text-xs text-muted">{task.effort_points} pts</span>}
      </div>
      <div className="mt-1.5">
        <ProjectTag project={project} />
      </div>
      {task.due_date && (
        <div className="mt-1">
          <DueBadge task={task} today={today} />
        </div>
      )}
      <footer className="mt-2 flex items-center gap-2 border-t border-line pt-2">
        <Avatar member={owner} size="sm" />
        <span className="min-w-0 flex-1 truncate text-xs text-muted">
          {memberName(owner)}
          {task.supporter_ids.length > 0 && ` +${task.supporter_ids.length}`}
        </span>
        {editable && onMove && (
          <select
            aria-label={`Move “${task.title}”`}
            value={task.status}
            onChange={(e) => onMove(e.target.value as TaskStatus)}
            className="hidden min-h-0 w-auto rounded-md border-line py-0.5 pr-6 pl-1.5 text-xs md:block"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        )}
        {editable && onMoveSheet && (
          <button type="button" onClick={onMoveSheet} className="btn-secondary btn-sm md:hidden" aria-label={`Move “${task.title}”`}>
            Move
          </button>
        )}
      </footer>
    </article>
  );
}
