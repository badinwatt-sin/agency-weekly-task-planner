import "server-only";
import { cache } from "react";
import { MEMBER_COLUMNS } from "./auth";
import { createClient } from "./supabase/server";
import type { Meeting, Member, Project, Task, TaskLink, WeekMove } from "./types";

// All reads go through the signed-in user's client, so row-level security applies.

const PAGE = 1000; // Supabase returns at most 1000 rows per request by default

type Raw = Record<string, unknown>;

async function fetchAll(build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<Raw[]> {
  const out: Raw[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Raw[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

export const TASK_SELECT = "*, task_supporters(member_id)";

export function toTask(row: Raw): Task {
  const supporters = (row.task_supporters as { member_id: string }[] | null) ?? [];
  const links = Array.isArray(row.links) ? (row.links as TaskLink[]) : [];
  const { task_supporters: _s, ...rest } = row;
  return { ...(rest as unknown as Task), links, supporter_ids: supporters.map((s) => s.member_id) };
}

export const getMembers = cache(async (includeInactive = false): Promise<Member[]> => {
  const supabase = await createClient();
  let q = supabase.from("members").select(MEMBER_COLUMNS).order("sort_order").order("full_name");
  if (!includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Member[];
});

export const getProjects = cache(async (includeInactive = false): Promise<Project[]> => {
  const supabase = await createClient();
  let q = supabase.from("projects").select("id, name, color, is_active, is_sample").order("name");
  if (!includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Project[];
});

/** All non-archived tasks. Small teams produce a few thousand tasks a year, which is fine to load. */
export const getTasks = cache(async (): Promise<Task[]> => {
  const supabase = await createClient();
  const rows = await fetchAll((from, to) =>
    supabase.from("tasks").select(TASK_SELECT).is("archived_at", null).order("created_at").range(from, to),
  );
  return rows.map(toTask);
});

export const getMoves = cache(async (): Promise<WeekMove[]> => {
  const supabase = await createClient();
  const rows = await fetchAll((from, to) =>
    supabase.from("task_week_moves").select("task_id, from_week, to_week, status_at_move, moved_at").order("id").range(from, to),
  );
  return rows as unknown as WeekMove[];
});

export async function getTask(id: string): Promise<Task | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("tasks").select(TASK_SELECT).eq("id", id).maybeSingle();
  return data ? toTask(data as Raw) : null;
}

export interface TaskUpdateRow {
  id: string;
  author_id: string | null;
  kind: "comment" | "progress";
  body: string;
  created_at: string;
}

export interface ActivityRow {
  id: number;
  actor_id: string | null;
  action: string;
  changes: Record<string, unknown>;
  created_at: string;
}

export async function getTaskHistory(id: string) {
  const supabase = await createClient();
  const [updates, activity, moves] = await Promise.all([
    supabase.from("task_updates").select("id, author_id, kind, body, created_at").eq("task_id", id).order("created_at", { ascending: false }),
    supabase.from("task_activity").select("id, actor_id, action, changes, created_at").eq("task_id", id).order("id", { ascending: false }).limit(200),
    supabase.from("task_week_moves").select("task_id, from_week, to_week, status_at_move, moved_at").eq("task_id", id).order("id"),
  ]);
  return {
    updates: (updates.data ?? []) as TaskUpdateRow[],
    activity: (activity.data ?? []) as ActivityRow[],
    moves: (moves.data ?? []) as WeekMove[],
  };
}

export const getMeetings = cache(async (): Promise<Meeting[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meetings")
    .select("id, title, meeting_date, week_start, notes, people, source, is_sample, created_by, created_at")
    .order("meeting_date", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as Meeting[];
});

export async function getMeeting(id: string): Promise<Meeting | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("meetings")
    .select("id, title, meeting_date, week_start, notes, people, source, is_sample, created_by, created_at")
    .eq("id", id)
    .maybeSingle();
  return (data as Meeting | null) ?? null;
}
