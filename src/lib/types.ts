export type Role = "member" | "manager";
export type TaskStatus = "backlog" | "todo" | "doing" | "done";
export type Priority = "high" | "medium" | "low";

export const STATUSES: TaskStatus[] = ["backlog", "todo", "doing", "done"];
export const PRIORITIES: Priority[] = ["high", "medium", "low"];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: "Backlog",
  todo: "To Do",
  doing: "Doing",
  done: "Done",
};

export const STATUS_HINT: Record<TaskStatus, string> = {
  backlog: "Waiting to be prioritised or scheduled",
  todo: "Planned for this week",
  doing: "In progress",
  done: "Completed",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

/** Relative size scale. Points are an estimate of effort, not of value or performance. */
export const EFFORT_OPTIONS: { points: number; label: string }[] = [
  { points: 1, label: "XS · 1 (an hour or two)" },
  { points: 2, label: "S · 2 (about half a day)" },
  { points: 3, label: "M · 3 (a day or two)" },
  { points: 5, label: "L · 5 (most of a week)" },
  { points: 8, label: "XL · 8 (more than a week)" },
];

export interface Member {
  id: string;
  full_name: string;
  display_name: string | null;
  role: Role;
  is_active: boolean;
  account_status: "no_account" | "invited" | "active";
  sort_order: number;
  is_sample: boolean;
}

export interface Project {
  id: string;
  name: string;
  color: string;
  is_active: boolean;
  is_sample: boolean;
}

export interface TaskLink {
  label: string;
  url: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  project_id: string | null;
  owner_id: string | null;
  status: TaskStatus;
  priority: Priority;
  planned_week: string | null; // YYYY-MM-DD (Monday)
  start_date: string | null;
  due_date: string | null;
  completed_on: string | null;
  effort_points: number | null;
  notes: string | null;
  links: TaskLink[];
  meeting_id: string | null;
  carry_over_count: number;
  is_sample: boolean;
  archived_at: string | null;
  version: number;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
  supporter_ids: string[];
}

export interface WeekMove {
  task_id: string;
  from_week: string;
  to_week: string | null;
  status_at_move: TaskStatus;
  moved_at: string;
}

export interface Meeting {
  id: string;
  title: string;
  meeting_date: string;
  week_start: string;
  notes: string | null;
  people: { member_id: string; update: string }[];
  source: "manual" | "claude";
  is_sample: boolean;
  created_by: string | null;
  created_at: string;
}

export interface CurrentUser {
  userId: string;
  member: Member;
  isManager: boolean;
}

export type ActionResult<T = null> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; conflict?: boolean; fieldErrors?: Record<string, string> };

export function memberName(m: Pick<Member, "full_name" | "display_name"> | undefined | null): string {
  if (!m) return "Unassigned";
  return m.display_name?.trim() || m.full_name;
}

/** The Manager keeps the planner up to date; team members view it (enforced again by the database). */
export function canEditTask(_task: Pick<Task, "owner_id" | "created_by" | "supporter_ids">, user: CurrentUser): boolean {
  return user.isManager;
}
