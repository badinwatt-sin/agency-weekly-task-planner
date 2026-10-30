// Pure dashboard / report calculations. Every number here has a matching
// task-list filter (see drill-down links in the views), and is covered by
// stats.test.ts. Counts and effort points are always kept separate.

import { addDays, monthEnd, monthKey, monthStart, weekStart } from "./dates";
import { isOverdue, isUpcoming } from "./filters";
import { STATUSES, type Member, type Task, type TaskStatus, type WeekMove } from "./types";

export interface Measure {
  count: number;
  effort: number;
  unestimated: number;
}

export const emptyMeasure = (): Measure => ({ count: 0, effort: 0, unestimated: 0 });

export function measure(tasks: Task[]): Measure {
  const m = emptyMeasure();
  for (const t of tasks) add(m, t);
  return m;
}

function add(m: Measure, t: Task) {
  m.count += 1;
  if (t.effort_points == null) m.unestimated += 1;
  else m.effort += t.effort_points;
}

export function countByStatus(tasks: Task[]): Record<TaskStatus, Measure> {
  const out = Object.fromEntries(STATUSES.map((s) => [s, emptyMeasure()])) as Record<TaskStatus, Measure>;
  for (const t of tasks) add(out[t.status], t);
  return out;
}

/**
 * Scope used by the dashboard's status table: every backlog task (backlog is
 * not tied to a week) plus To Do / Doing / Done tasks planned in the period.
 */
export function inDashboardScope(t: Task, from: string, to: string): boolean {
  if (t.status === "backlog") return true;
  return !!t.planned_week && t.planned_week >= from && t.planned_week <= to;
}

export interface MemberStatusRow {
  memberId: string | null;
  byStatus: Record<TaskStatus, Measure>;
  total: Measure;
}

export function statusByMember(tasks: Task[], members: Pick<Member, "id">[]): MemberStatusRow[] {
  const rows = new Map<string | null, MemberStatusRow>();
  const make = (id: string | null): MemberStatusRow => ({
    memberId: id,
    byStatus: Object.fromEntries(STATUSES.map((s) => [s, emptyMeasure()])) as Record<TaskStatus, Measure>,
    total: emptyMeasure(),
  });
  for (const m of members) rows.set(m.id, make(m.id));
  for (const t of tasks) {
    const key = t.owner_id;
    if (!rows.has(key)) rows.set(key, make(key));
    const row = rows.get(key)!;
    add(row.byStatus[t.status], t);
    add(row.total, t);
  }
  return [...rows.values()];
}

export interface PeriodPoint {
  key: string; // week Monday or YYYY-MM
  planned: Measure;
  completed: Measure;
  carriedOut: number;
}

function plannedIn(tasks: Task[], moves: WeekMove[], inBucket: (week: string) => boolean): Task[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const ids = new Set<string>();
  for (const t of tasks) if (t.planned_week && inBucket(t.planned_week)) ids.add(t.id);
  for (const m of moves) if (inBucket(m.from_week) && byId.has(m.task_id)) ids.add(m.task_id);
  return [...ids].map((id) => byId.get(id)!);
}

/**
 * Planned in week W = tasks currently planned for W plus tasks that were planned
 * for W and later carried to another week. Completed in W = completion date in W.
 */
export function weeklySeries(tasks: Task[], moves: WeekMove[], weeks: string[]): PeriodPoint[] {
  const taskIds = new Set(tasks.map((t) => t.id));
  return weeks.map((w) => {
    const end = addDays(w, 6);
    return {
      key: w,
      planned: measure(plannedIn(tasks, moves, (x) => x === w)),
      completed: measure(tasks.filter((t) => t.status === "done" && t.completed_on && t.completed_on >= w && t.completed_on <= end)),
      carriedOut: new Set(moves.filter((m) => m.from_week === w && taskIds.has(m.task_id)).map((m) => m.task_id)).size,
    };
  });
}

/** Months are bucketed by the Monday that starts each planned week. */
export function monthlySeries(tasks: Task[], moves: WeekMove[], months: string[]): PeriodPoint[] {
  const taskIds = new Set(tasks.map((t) => t.id));
  return months.map((m) => {
    const from = monthStart(m);
    const to = monthEnd(m);
    return {
      key: m,
      planned: measure(plannedIn(tasks, moves, (w) => monthKey(w) === m)),
      completed: measure(tasks.filter((t) => t.status === "done" && t.completed_on && t.completed_on >= from && t.completed_on <= to)),
      carriedOut: new Set(moves.filter((mv) => monthKey(mv.from_week) === m && taskIds.has(mv.task_id)).map((mv) => mv.task_id)).size,
    };
  });
}

export interface WorkloadRow {
  memberId: string | null;
  open: Measure; // To Do + Doing
  overdue: number;
}

/** Open work (To Do + Doing) per owner. Count and effort are reported side by side, never combined. */
export function workloadByOwner(tasks: Task[], members: Pick<Member, "id">[], today: string): WorkloadRow[] {
  const rows = new Map<string | null, WorkloadRow>();
  for (const m of members) rows.set(m.id, { memberId: m.id, open: emptyMeasure(), overdue: 0 });
  for (const t of tasks) {
    if (t.status !== "todo" && t.status !== "doing") continue;
    if (!rows.has(t.owner_id)) rows.set(t.owner_id, { memberId: t.owner_id, open: emptyMeasure(), overdue: 0 });
    const r = rows.get(t.owner_id)!;
    add(r.open, t);
    if (isOverdue(t, today)) r.overdue += 1;
  }
  return [...rows.values()];
}

export function overdueTasks(tasks: Task[], today: string): Task[] {
  return tasks.filter((t) => isOverdue(t, today)).sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1));
}

export function upcomingTasks(tasks: Task[], today: string): Task[] {
  return tasks.filter((t) => isUpcoming(t, today)).sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1));
}

export interface YearSummary {
  year: number;
  months: PeriodPoint[];
  completed: Measure; // completion date in the year
  ongoing: Measure; // To Do / Doing, planned in the year
  overdue: Measure; // not done, due in the year and before today
  backlog: Measure; // all backlog items (not tied to a year)
}

export function yearSummary(tasks: Task[], moves: WeekMove[], year: number, today: string): YearSummary {
  const y = String(year);
  const months = Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, "0")}`);
  return {
    year,
    months: monthlySeries(tasks, moves, months),
    completed: measure(tasks.filter((t) => t.status === "done" && t.completed_on?.startsWith(y))),
    ongoing: measure(tasks.filter((t) => (t.status === "todo" || t.status === "doing") && t.planned_week?.startsWith(y))),
    overdue: measure(tasks.filter((t) => isOverdue(t, today) && t.due_date!.startsWith(y))),
    backlog: measure(tasks.filter((t) => t.status === "backlog")),
  };
}

/** Upcoming weekly load for one person: open tasks by planned week. */
export function personWeeklyLoad(tasks: Task[], memberId: string, today: string, weeks = 6) {
  const first = weekStart(today);
  return Array.from({ length: weeks }, (_, i) => {
    const w = addDays(first, i * 7);
    return {
      week: w,
      open: measure(tasks.filter((t) => t.owner_id === memberId && t.planned_week === w && (t.status === "todo" || t.status === "doing"))),
      supporting: tasks.filter((t) => t.supporter_ids.includes(memberId) && t.planned_week === w && t.status !== "done").length,
    };
  });
}
