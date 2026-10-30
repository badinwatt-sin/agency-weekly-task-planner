"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { aiEnabled, AiError, askClaudeForPlan, readUpload, type NotesInput } from "@/lib/ai";
import { buildPrompt, cleanDraft, type MeetingDraft } from "@/lib/ai-draft";
import { actionUser, AuthError, MEMBER_COLUMNS } from "@/lib/auth";
import { addDays, isIsoDate, weekStart } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { STATUSES, type ActionResult, type TaskStatus } from "@/lib/types";

const itemSchema = z.object({
  title: z.string().trim().min(1).max(200),
  owner_id: z.union([z.string().uuid(), z.null()]),
  priority: z.enum(["high", "medium", "low"]),
  due_date: z.union([z.string().refine(isIsoDate), z.null()]),
  target: z.enum(["this", "next", "backlog"]),
});

const meetingSchema = z.object({
  title: z.string().trim().min(1, "Give the meeting a title").max(160),
  meeting_date: z.string().refine(isIsoDate, "Choose a date"),
  notes: z.union([z.string().trim().max(20000), z.null()]),
});

/** Read the repeated action-item rows submitted by ActionItemsEditor. */
function readItems(fd: FormData) {
  const titles = fd.getAll("item_title").map(String);
  const owners = fd.getAll("item_owner").map(String);
  const priorities = fd.getAll("item_priority").map(String);
  const dues = fd.getAll("item_due").map(String);
  const targets = fd.getAll("item_target").map(String);
  const items = [];
  for (let i = 0; i < titles.length; i++) {
    if (!titles[i].trim()) continue;
    const parsed = itemSchema.safeParse({
      title: titles[i],
      owner_id: owners[i] || null,
      priority: priorities[i] || "medium",
      due_date: dues[i] || null,
      target: targets[i] || "this",
    });
    if (!parsed.success) return { error: `Action item ${i + 1}: ${parsed.error.issues[0]?.message ?? "invalid"}` } as const;
    items.push(parsed.data);
  }
  if (items.length > 50) return { error: "Up to 50 action items at a time." } as const;
  return { items } as const;
}

async function insertItems(meetingId: string, meetingWeek: string, items: z.infer<typeof itemSchema>[]) {
  if (!items.length) return null;
  const supabase = await createClient();
  const rows = items.map((it) => ({
    title: it.title,
    owner_id: it.owner_id,
    priority: it.priority,
    due_date: it.due_date,
    status: it.target === "backlog" ? "backlog" : "todo",
    planned_week: it.target === "backlog" ? null : it.target === "next" ? addDays(meetingWeek, 7) : meetingWeek,
    start_date: null,
    meeting_id: meetingId,
  }));
  const { error } = await supabase.from("tasks").insert(rows);
  return error ? "Some action items could not be saved." : null;
}

export async function createMeeting(_prev: ActionResult<null> | null, fd: FormData): Promise<ActionResult<null>> {
  let id: string;
  try {
    await actionUser({ manager: true });
    const parsed = meetingSchema.safeParse({ title: fd.get("title"), meeting_date: fd.get("meeting_date"), notes: (fd.get("notes") as string)?.trim() || null });
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
    const read = readItems(fd);
    if ("error" in read) return { ok: false, error: read.error! };
    const week = weekStart(parsed.data.meeting_date);
    const supabase = await createClient();
    const { data, error } = await supabase.from("meetings").insert({ ...parsed.data, week_start: week }).select("id").single();
    if (error || !data) return { ok: false, error: "Could not save the meeting." };
    const itemError = await insertItems(data.id, week, read.items);
    if (itemError) return { ok: false, error: itemError };
    id = data.id;
  } catch (e) {
    return { ok: false, error: e instanceof AuthError ? e.message : "Something went wrong." };
  }
  revalidatePath("/", "layout");
  redirect(`/meetings/${id}?saved=1`);
}

export async function addActionItems(_prev: ActionResult<null> | null, fd: FormData): Promise<ActionResult<null>> {
  try {
    await actionUser({ manager: true });
    const meetingId = z.string().uuid().safeParse(fd.get("meeting_id"));
    if (!meetingId.success) return { ok: false, error: "Invalid meeting." };
    const read = readItems(fd);
    if ("error" in read) return { ok: false, error: read.error! };
    if (!read.items.length) return { ok: false, error: "Add at least one action item." };
    const supabase = await createClient();
    const { data: meeting } = await supabase.from("meetings").select("week_start").eq("id", meetingId.data).maybeSingle();
    if (!meeting) return { ok: false, error: "Meeting not found." };
    const itemError = await insertItems(meetingId.data, meeting.week_start, read.items);
    if (itemError) return { ok: false, error: itemError };
    revalidatePath("/", "layout");
    return { ok: true, data: null, message: `${read.items.length} action item(s) added to the board.` };
  } catch (e) {
    return { ok: false, error: e instanceof AuthError ? e.message : "Something went wrong." };
  }
}

export async function updateMeetingNotes(_prev: ActionResult<null> | null, fd: FormData): Promise<ActionResult<null>> {
  try {
    await actionUser({ manager: true });
    const id = z.string().uuid().safeParse(fd.get("id"));
    const parsed = meetingSchema.safeParse({ title: fd.get("title"), meeting_date: fd.get("meeting_date"), notes: (fd.get("notes") as string)?.trim() || null });
    if (!id.success || !parsed.success) return { ok: false, error: "Please check the form." };
    const supabase = await createClient();
    const { data } = await supabase.from("meetings").update({ ...parsed.data, week_start: weekStart(parsed.data.meeting_date) }).eq("id", id.data).select("id");
    if (!data?.length) return { ok: false, error: "Only the Manager can edit meeting notes." };
    revalidatePath(`/meetings/${id.data}`);
    return { ok: true, data: null, message: "Meeting saved." };
  } catch (e) {
    return { ok: false, error: e instanceof AuthError ? e.message : "Something went wrong." };
  }
}

/* ------------------------------------------------------------------
   Meeting notes → plan, with Claude (Manager only)
   ------------------------------------------------------------------ */

export async function summarizeNotes(fd: FormData): Promise<ActionResult<MeetingDraft>> {
  try {
    await actionUser({ manager: true });
    if (!aiEnabled()) return { ok: false, error: "The meeting summarizer isn't set up yet. Add ANTHROPIC_API_KEY in the hosting settings (see docs)." };
    const date = String(fd.get("meeting_date") ?? "");
    if (!isIsoDate(date)) return { ok: false, error: "Choose the meeting date first." };
    const typed = String(fd.get("notes") ?? "").trim().slice(0, 150_000);
    const files = fd.getAll("files").filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f && (f as File).size > 0);
    if (files.length > 10) return { ok: false, error: "Upload up to 10 files at a time." };
    const inputs: NotesInput[] = [];
    for (const f of files) inputs.push(await readUpload(f));
    const texts = inputs.filter((i): i is NotesInput & { kind: "text" } => i.kind === "text");
    const images = inputs.filter((i): i is NotesInput & { kind: "image" } => i.kind === "image");
    if (!typed && !texts.length && !images.length) return { ok: false, error: "Paste the notes or upload a file first." };
    if (images.length > 8) return { ok: false, error: "Use up to 8 images per summary." };
    const notes = [typed, ...texts.map((t) => `--- File: ${t.name} ---\n${t.text}`)].filter(Boolean).join("\n\n").slice(0, 150_000);

    const supabase = await createClient();
    const [{ data: members }, { data: projects }, { data: open }] = await Promise.all([
      supabase.from("members").select(MEMBER_COLUMNS).eq("is_active", true).order("sort_order"),
      supabase.from("projects").select("id, name").eq("is_active", true).order("name"),
      supabase.from("tasks").select("id, title, owner_id, status, planned_week, due_date, version").is("archived_at", null).neq("status", "done").order("updated_at", { ascending: false }).limit(150),
    ]);
    const memberRows = (members ?? []) as { id: string; full_name: string; display_name: string | null; role: string }[];
    const projectRows = (projects ?? []) as { id: string; name: string }[];
    const openRows = (open ?? []) as { id: string; title: string; owner_id: string | null; status: TaskStatus; planned_week: string | null; due_date: string | null; version: number }[];

    const raw = await askClaudeForPlan(buildPrompt({ meetingDate: date, members: memberRows, projects: projectRows, openTasks: openRows, notes, imageCount: images.length }), images);
    const draft = cleanDraft(raw, {
      memberIds: new Set(memberRows.map((m) => m.id)),
      projectIds: new Set(projectRows.map((p) => p.id)),
      tasks: new Map(openRows.map((t) => [t.id, { title: t.title, status: t.status, version: t.version }])),
    });
    if (!draft.summary && !draft.people.length && !draft.new_tasks.length && !draft.task_updates.length) {
      return { ok: false, error: "Claude didn't find anything to plan in these notes. Check they're the right notes and try again." };
    }
    return { ok: true, data: draft };
  } catch (e) {
    if (e instanceof AiError || e instanceof AuthError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Something went wrong while summarizing. Please try again." };
  }
}

const draftSaveSchema = z.object({
  title: z.string().trim().min(1, "Give the meeting a title").max(160),
  meeting_date: z.string().refine(isIsoDate, "Choose a date"),
  summary: z.string().trim().max(20000),
  people: z.array(z.object({ member_id: z.string().uuid(), update: z.string().trim().max(1500) })).max(60),
  new_tasks: z.array(z.object({
    include: z.boolean(),
    title: z.string().trim().max(200),
    owner_id: z.string().uuid().nullable(),
    supporter_ids: z.array(z.string().uuid()).max(20),
    priority: z.enum(["high", "medium", "low"]),
    due_date: z.string().refine(isIsoDate).nullable(),
    week: z.enum(["this", "next", "backlog"]),
    status: z.enum(["todo", "doing", "done"]),
    project_id: z.string().uuid().nullable(),
    notes: z.string().max(500),
  })).max(60),
  task_updates: z.array(z.object({
    include: z.boolean(),
    task_id: z.string().uuid(),
    version: z.number().int().positive(),
    status: z.union([z.enum(STATUSES as [TaskStatus, ...TaskStatus[]]), z.literal("")]),
    note: z.string().trim().max(1500),
  })).max(60),
});

export type DraftToSave = z.infer<typeof draftSaveSchema>;

/** Save the reviewed draft: meeting + per-person updates, new tasks, status changes and progress notes. */
export async function saveMeetingDraft(input: DraftToSave): Promise<ActionResult<null>> {
  let target: string;
  try {
    await actionUser({ manager: true });
    const p = draftSaveSchema.safeParse(input);
    if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Please check the draft." };
    const d = p.data;
    const week = weekStart(d.meeting_date);
    const supabase = await createClient();
    const { data: meeting, error } = await supabase
      .from("meetings")
      .insert({ title: d.title, meeting_date: d.meeting_date, week_start: week, notes: d.summary || null, people: d.people.filter((x) => x.update), source: "claude" })
      .select("id")
      .single();
    if (error || !meeting) return { ok: false, error: "Could not save the meeting." };

    const rows = d.new_tasks.filter((t) => t.include && t.title).map((t) => {
      const status = t.week === "backlog" && t.status === "todo" ? "backlog" : t.status;
      return {
        title: t.title, owner_id: t.owner_id, priority: t.priority, due_date: t.due_date, status,
        planned_week: status === "backlog" ? null : t.week === "next" ? addDays(week, 7) : week,
        project_id: t.project_id, notes: t.notes || null, meeting_id: meeting.id,
        _supporters: t.supporter_ids.filter((s) => s !== t.owner_id),
      };
    });
    let made = 0;
    for (const { _supporters, ...row } of rows) {
      const { data: created } = await supabase.from("tasks").insert(row).select("id").single();
      if (!created) continue;
      made++;
      if (_supporters.length) await supabase.from("task_supporters").insert(_supporters.map((member_id) => ({ task_id: created.id, member_id })));
    }

    let changed = 0, skipped = 0;
    for (const u of d.task_updates.filter((x) => x.include)) {
      if (u.status) {
        const { data: ok } = await supabase.from("tasks").update({ status: u.status }).eq("id", u.task_id).eq("version", u.version).select("id");
        if (ok?.length) changed++; else skipped++; // someone changed it since the summary: leave it alone
      }
      if (u.note) await supabase.from("task_updates").insert({ task_id: u.task_id, kind: "progress", body: `${u.note}\n— ${d.title}, ${d.meeting_date}`.slice(0, 4000) });
    }
    target = `/meetings/${meeting.id}?saved=1&made=${made}&changed=${changed}&skipped=${skipped}`;
  } catch (e) {
    return { ok: false, error: e instanceof AuthError ? e.message : "Something went wrong while saving." };
  }
  revalidatePath("/", "layout");
  redirect(target);
}
