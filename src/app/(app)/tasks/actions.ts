"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actionUser, AuthError } from "@/lib/auth";
import { addDays, formatDateTime, isMonday, todayIso, weekStart } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { memberName, STATUSES, type ActionResult, type TaskStatus } from "@/lib/types";
import { fieldErrors, taskInputFromForm, taskInputSchema, updateInputSchema } from "@/lib/validation";

type Supabase = Awaited<ReturnType<typeof createClient>>;

function authFail(e: unknown): { ok: false; error: string } {
  if (e instanceof AuthError) return { ok: false, error: e.message };
  console.error(e);
  return { ok: false, error: "Something went wrong. Please try again." };
}

function refresh(taskId?: string) {
  revalidatePath("/", "layout");
  if (taskId) revalidatePath(`/tasks/${taskId}`);
}

/**
 * Explain why a version-checked update matched no rows: either someone else
 * saved first (conflict) or this person isn't allowed to edit the task.
 */
async function explainNoUpdate(supabase: Supabase, id: string, expectedVersion: number): Promise<{ ok: false; error: string; conflict?: boolean }> {
  const { data } = await supabase.from("tasks").select("version, updated_at, updated_by").eq("id", id).maybeSingle();
  if (!data) return { ok: false, error: "This task no longer exists." };
  if (data.version !== expectedVersion) {
    let who = "someone else";
    if (data.updated_by) {
      const { data: m } = await supabase.from("members").select("full_name, display_name").eq("id", data.updated_by).maybeSingle();
      if (m) who = memberName(m);
    }
    return {
      ok: false,
      conflict: true,
      error: `${who} updated this task at ${formatDateTime(data.updated_at)} while you were editing. Your changes have NOT been saved — reload to see the latest version, then re-apply your edits.`,
    };
  }
  return { ok: false, error: "You can only edit tasks you own, created or support. Ask the owner or the Manager." };
}

async function syncSupporters(supabase: Supabase, taskId: string, wanted: string[]) {
  const { data } = await supabase.from("task_supporters").select("member_id").eq("task_id", taskId);
  const current = new Set<string>(((data ?? []) as { member_id: string }[]).map((r: { member_id: string }) => r.member_id));
  const target = new Set(wanted);
  const toAdd = [...target].filter((id) => !current.has(id));
  const toRemove = [...current].filter((id) => !target.has(id));
  if (toRemove.length) await supabase.from("task_supporters").delete().eq("task_id", taskId).in("member_id", toRemove);
  if (toAdd.length) await supabase.from("task_supporters").insert(toAdd.map((member_id) => ({ task_id: taskId, member_id })));
}

export type TaskFormState = ActionResult<{ id: string; version: number }> | null;

export async function createTask(_prev: TaskFormState, fd: FormData): Promise<TaskFormState> {
  let newId: string;
  try {
    await actionUser({ manager: true });
    const parsed = taskInputSchema.safeParse(taskInputFromForm(fd));
    if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
    const { supporter_ids, completed_on, ...row } = parsed.data;
    const meetingId = fd.get("meeting_id");
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tasks")
      .insert({ ...row, completed_on: row.status === "done" ? completed_on : null, meeting_id: typeof meetingId === "string" && meetingId ? meetingId : null })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: "Could not create the task." };
    if (supporter_ids.length) await syncSupporters(supabase, data.id, supporter_ids);
    newId = data.id;
  } catch (e) {
    return authFail(e);
  }
  refresh();
  redirect(`/tasks/${newId}?created=1`);
}

export async function updateTask(_prev: TaskFormState, fd: FormData): Promise<TaskFormState> {
  try {
    await actionUser({ manager: true });
    const id = z.string().uuid().safeParse(fd.get("id"));
    const version = Number(fd.get("version"));
    if (!id.success || !Number.isInteger(version)) return { ok: false, error: "Invalid request." };
    const parsed = taskInputSchema.safeParse(taskInputFromForm(fd));
    if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
    const { supporter_ids, ...row } = parsed.data;

    const supabase = await createClient();
    const { data, error } = await supabase.from("tasks").update(row).eq("id", id.data).eq("version", version).select("id, version");
    if (error) return { ok: false, error: "Could not save the task." };
    if (!data?.length) return explainNoUpdate(supabase, id.data, version);
    await syncSupporters(supabase, id.data, supporter_ids);
    refresh(id.data);
    return { ok: true, data: { id: id.data, version: data[0].version }, message: "Saved." };
  } catch (e) {
    return authFail(e);
  }
}

const moveSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  status: z.enum(STATUSES as [TaskStatus, ...TaskStatus[]]),
  plannedWeek: z.string().refine(isMonday).nullable(),
});

/** Board drag-and-drop / "move to" menu. Moving into a weekly column schedules the task for that week. */
export async function moveTask(input: z.infer<typeof moveSchema>): Promise<ActionResult<{ version: number }>> {
  try {
    await actionUser({ manager: true });
    const p = moveSchema.safeParse(input);
    if (!p.success) return { ok: false, error: "Invalid move." };
    const patch: Record<string, unknown> = { status: p.data.status };
    if (p.data.status !== "backlog" && p.data.plannedWeek) patch.planned_week = p.data.plannedWeek;
    const supabase = await createClient();
    const { data, error } = await supabase.from("tasks").update(patch).eq("id", p.data.id).eq("version", p.data.version).select("version");
    if (error) return { ok: false, error: "Could not move the task." };
    if (!data?.length) return explainNoUpdate(supabase, p.data.id, p.data.version);
    refresh(p.data.id);
    return { ok: true, data: { version: data[0].version } };
  } catch (e) {
    return authFail(e);
  }
}

/** Move one unfinished task to the following week, keeping its history. */
export async function carryTaskForward(_prev: ActionResult<null> | null, fd: FormData): Promise<ActionResult<null>> {
  try {
    await actionUser({ manager: true });
    const id = String(fd.get("id"));
    const version = Number(fd.get("version"));
    const supabase = await createClient();
    const { data: t } = await supabase.from("tasks").select("planned_week, status").eq("id", id).maybeSingle();
    if (!t) return { ok: false, error: "Task not found." };
    if (t.status === "done") return { ok: false, error: "Finished tasks don't need to be carried over." };
    const base = t.planned_week ?? weekStart(todayIso());
    const target = addDays(base, 7);
    const { data } = await supabase
      .from("tasks")
      .update({ planned_week: target, status: t.status === "backlog" ? "todo" : t.status })
      .eq("id", id)
      .eq("version", version)
      .select("version");
    if (!data?.length) return explainNoUpdate(supabase, id, version);
    refresh(id);
    return { ok: true, data: null, message: "Moved to the following week. The original week is kept in its history." };
  } catch (e) {
    return authFail(e);
  }
}

/** Manager: carry every unfinished To Do / Doing task of a week to the next week. */
export async function carryWeekForward(week: string): Promise<ActionResult<{ moved: number }>> {
  try {
    await actionUser({ manager: true });
    if (!isMonday(week)) return { ok: false, error: "Invalid week." };
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("carry_over_week", { p_from_week: week });
    if (error) return { ok: false, error: "Could not carry tasks over." };
    refresh();
    return { ok: true, data: { moved: Number(data ?? 0) } };
  } catch (e) {
    return authFail(e);
  }
}

export async function archiveTask(_prev: ActionResult<null> | null, fd: FormData): Promise<ActionResult<null>> {
  try {
    await actionUser({ manager: true });
    const id = String(fd.get("id"));
    const version = Number(fd.get("version"));
    const supabase = await createClient();
    const { data } = await supabase.from("tasks").update({ archived_at: new Date().toISOString() }).eq("id", id).eq("version", version).select("id");
    if (!data?.length) return explainNoUpdate(supabase, id, version);
  } catch (e) {
    return authFail(e);
  }
  refresh();
  redirect("/board?archived=1");
}

export async function addTaskUpdate(_prev: ActionResult<null> | null, fd: FormData): Promise<ActionResult<null>> {
  try {
    await actionUser({ manager: true });
    const parsed = updateInputSchema.safeParse({ task_id: fd.get("task_id"), kind: fd.get("kind"), body: fd.get("body") });
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid update." };
    const supabase = await createClient();
    const { error } = await supabase.from("task_updates").insert(parsed.data);
    if (error) return { ok: false, error: "Could not post the update." };
    refresh(parsed.data.task_id);
    return { ok: true, data: null, message: "Posted." };
  } catch (e) {
    return authFail(e);
  }
}
