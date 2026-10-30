import { addDays, isIsoDate, isMonday } from "./dates";
import { PRIORITIES, STATUSES, type Priority, type Task, type TaskStatus, type WeekMove } from "./types";

export type DateField = "due" | "start" | "planned" | "completed";

export interface TaskFilters {
  q?: string;
  owner?: string; // member id or "none"
  status?: TaskStatus[];
  project?: string; // project id or "none"
  priority?: Priority;
  dateField?: DateField;
  from?: string;
  to?: string;
  /** With dateField=planned: also include tasks that were planned in the range but later moved. */
  withMoved?: boolean;
  overdue?: boolean;
  upcoming?: boolean;
  carried?: boolean;
  movedFrom?: string;
  /** With movedFrom: last week of the range (defaults to movedFrom). */
  movedTo?: string;
  sample?: "only" | "hide";
}

export const UPCOMING_DAYS = 7;

type Params = Record<string, string | string[] | undefined>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Parse untrusted URL parameters into a safe filter object (invalid values are dropped). */
export function parseFilters(params: Params): TaskFilters {
  const f: TaskFilters = {};
  const q = one(params.q)?.trim();
  if (q) f.q = q.slice(0, 100);

  const owner = one(params.owner);
  if (owner && (owner === "none" || UUID.test(owner))) f.owner = owner;

  const status = one(params.status);
  if (status) {
    const list = status.split(",").filter((s): s is TaskStatus => (STATUSES as string[]).includes(s));
    if (list.length) f.status = list;
  }

  const project = one(params.project);
  if (project && (project === "none" || UUID.test(project))) f.project = project;

  const priority = one(params.priority);
  if (priority && (PRIORITIES as string[]).includes(priority)) f.priority = priority as Priority;

  const dateField = one(params.dateField);
  if (dateField && ["due", "start", "planned", "completed"].includes(dateField)) f.dateField = dateField as DateField;
  const from = one(params.from);
  const to = one(params.to);
  if (isIsoDate(from)) f.from = from;
  if (isIsoDate(to)) f.to = to;
  if (f.from || f.to) f.dateField ??= "due";
  else delete f.dateField;

  if (one(params.withMoved) === "1") f.withMoved = true;
  if (one(params.overdue) === "1") f.overdue = true;
  if (one(params.upcoming) === "1") f.upcoming = true;
  if (one(params.carried) === "1") f.carried = true;
  const movedFrom = one(params.movedFrom);
  if (movedFrom && isMonday(movedFrom)) {
    f.movedFrom = movedFrom;
    const movedTo = one(params.movedTo);
    if (movedTo && isMonday(movedTo) && movedTo > movedFrom) f.movedTo = movedTo;
  }
  const sample = one(params.sample);
  if (sample === "only" || sample === "hide") f.sample = sample;
  return f;
}

export function filtersToSearch(f: TaskFilters): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.owner) p.set("owner", f.owner);
  if (f.status?.length) p.set("status", f.status.join(","));
  if (f.project) p.set("project", f.project);
  if (f.priority) p.set("priority", f.priority);
  if (f.dateField && (f.from || f.to)) p.set("dateField", f.dateField);
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  if (f.withMoved) p.set("withMoved", "1");
  if (f.overdue) p.set("overdue", "1");
  if (f.upcoming) p.set("upcoming", "1");
  if (f.carried) p.set("carried", "1");
  if (f.movedFrom) p.set("movedFrom", f.movedFrom);
  if (f.movedFrom && f.movedTo) p.set("movedTo", f.movedTo);
  if (f.sample) p.set("sample", f.sample);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Link to the task list showing exactly the tasks behind a number. */
export function taskListHref(f: TaskFilters): string {
  return `/tasks${filtersToSearch(f)}`;
}

export function isOverdue(t: Pick<Task, "status" | "due_date">, today: string): boolean {
  return t.status !== "done" && !!t.due_date && t.due_date < today;
}

export function isUpcoming(t: Pick<Task, "status" | "due_date">, today: string, days = UPCOMING_DAYS): boolean {
  return t.status !== "done" && !!t.due_date && t.due_date >= today && t.due_date <= addDays(today, days);
}

function dateOf(t: Task, field: DateField): string | null {
  switch (field) {
    case "due":
      return t.due_date;
    case "start":
      return t.start_date;
    case "planned":
      return t.planned_week;
    case "completed":
      return t.completed_on;
  }
}

export function filterTasks(tasks: Task[], f: TaskFilters, today: string, moves: WeekMove[] = []): Task[] {
  const q = f.q?.toLowerCase();
  const movedIds = new Set<string>();
  if (f.withMoved && f.dateField === "planned") {
    for (const m of moves) {
      if ((!f.from || m.from_week >= f.from) && (!f.to || m.from_week <= f.to)) movedIds.add(m.task_id);
    }
  }
  const movedFromIds = f.movedFrom
    ? new Set(moves.filter((m) => m.from_week >= f.movedFrom! && m.from_week <= (f.movedTo ?? f.movedFrom!)).map((m) => m.task_id))
    : null;

  return tasks.filter((t) => {
    if (q) {
      const hay = `${t.title} ${t.description ?? ""} ${t.notes ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.owner) {
      if (f.owner === "none" ? t.owner_id !== null : t.owner_id !== f.owner) return false;
    }
    if (f.status && !f.status.includes(t.status)) return false;
    if (f.project) {
      if (f.project === "none" ? t.project_id !== null : t.project_id !== f.project) return false;
    }
    if (f.priority && t.priority !== f.priority) return false;
    if (f.dateField && (f.from || f.to)) {
      const d = dateOf(t, f.dateField);
      const inRange = !!d && (!f.from || d >= f.from) && (!f.to || d <= f.to);
      if (!inRange && !movedIds.has(t.id)) return false;
    }
    if (f.overdue && !isOverdue(t, today)) return false;
    if (f.upcoming && !isUpcoming(t, today)) return false;
    if (f.carried && t.carry_over_count < 1) return false;
    if (movedFromIds && !movedFromIds.has(t.id)) return false;
    if (f.sample === "only" && !t.is_sample) return false;
    if (f.sample === "hide" && t.is_sample) return false;
    return true;
  });
}

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

/** Default ordering: overdue first, then due date, then priority, then title. */
export function sortTasks(tasks: Task[], today: string): Task[] {
  return [...tasks].sort((a, b) => {
    const ao = isOverdue(a, today) ? 0 : 1;
    const bo = isOverdue(b, today) ? 0 : 1;
    if (ao !== bo) return ao - bo;
    const ad = a.due_date ?? "9999-12-31";
    const bd = b.due_date ?? "9999-12-31";
    if (ad !== bd) return ad < bd ? -1 : 1;
    if (a.priority !== b.priority) return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    return a.title.localeCompare(b.title);
  });
}
