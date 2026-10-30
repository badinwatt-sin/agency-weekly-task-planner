// Pure helpers for the meeting summarizer: prompt text, parsing and cleaning
// Claude's answer. No network or secrets here, so it is unit-tested directly.

import { addDays, isIsoDate, weekStart } from "./dates";
import { PRIORITIES, STATUSES, type Priority, type TaskStatus } from "./types";

export interface DraftPerson { member_id: string; update: string }
export interface DraftNewTask {
  include: boolean;
  title: string;
  owner_id: string | null;
  supporter_ids: string[];
  priority: Priority;
  due_date: string | null;
  week: "this" | "next" | "backlog";
  status: "todo" | "doing" | "done";
  project_id: string | null;
  notes: string;
}
export interface DraftTaskUpdate {
  include: boolean;
  task_id: string;
  task_title: string;
  current_status: TaskStatus;
  version: number;
  status: TaskStatus | "";
  note: string;
}
export interface MeetingDraft {
  summary: string;
  people: DraftPerson[];
  new_tasks: DraftNewTask[];
  task_updates: DraftTaskUpdate[];
}

export interface PromptContext {
  meetingDate: string;
  members: { id: string; full_name: string; display_name: string | null; role: string }[];
  projects: { id: string; name: string }[];
  openTasks: { id: string; title: string; owner_id: string | null; status: TaskStatus; planned_week: string | null; due_date: string | null }[];
  notes: string;
  imageCount: number;
}

const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function buildPrompt(c: PromptContext): string {
  const week = weekStart(c.meetingDate);
  const dow = DOW[new Date(c.meetingDate + "T00:00:00Z").getUTCDay()];
  const team = c.members.map((m) => `${m.id}: ${m.full_name}${m.display_name && m.display_name !== m.full_name ? ` (also called ${m.display_name})` : ""}${m.role === "manager" ? " — Manager" : ""}`).join("\n");
  const projects = c.projects.map((p) => `${p.id}: ${p.name}`).join("\n") || "(none)";
  const open = c.openTasks.map((t) => `${t.id} | ${t.title} | owner ${t.owner_id ?? "-"} | ${t.status} | week ${t.planned_week ?? "backlog"} | due ${t.due_date ?? "-"}`).join("\n") || "(none)";
  return `You help a team manager turn weekly meeting notes into a task plan for a shared board.

Meeting date: ${c.meetingDate} (${dow}). The meeting week starts Monday ${week}; the following week starts ${addDays(week, 7)}. Time zone: Asia/Bangkok.

TEAM (id: name):
${team}

PROJECTS (id: name):
${projects}

OPEN TASKS ALREADY ON THE BOARD (id | title | owner id | status | planned week | due):
${open}

MEETING NOTES (Thai and/or English; often one message per person)${c.imageCount ? `. ${c.imageCount} image(s) are attached: photos or screenshots of notes or chat messages; read them as part of the notes` : ""}:
<<<
${c.notes || "(see the attached images)"}
>>>

Reply with only one JSON object, no other text:
{
  "summary": "the meeting summary as short bullet lines starting with • — key updates, decisions, risks and blockers",
  "people": [{"member_id": "<team id>", "update": "1-3 sentences: what this person reported and what they will do next"}],
  "new_tasks": [{"title": "short action title", "owner_id": "<team id> or null", "supporter_ids": [], "priority": "high | medium | low", "due_date": "YYYY-MM-DD or null", "week": "this | next | backlog", "status": "todo | doing | done", "project_id": "<project id> or null", "notes": "one line of context from the notes"}],
  "task_updates": [{"task_id": "<id from OPEN TASKS>", "status": "todo | doing | done, or null if unchanged", "note": "what was reported about it"}]
}

Rules:
- Write the summary, updates, titles and notes in the language the notes mostly use.
- Use only ids from the lists above. Match people by full name, first name or nickname; if you can't tell who someone is, use null and mention the name in "notes".
- When a note reports progress on something already in OPEN TASKS, put it in task_updates instead of creating a duplicate new task.
- Only create tasks for work actually mentioned. Don't invent work, owners or deadlines.
- Turn relative dates ("Friday", "next week", "ศุกร์นี้", "อาทิตย์หน้า") into dates using the meeting date.
- "week": "this" for work planned for the meeting week, "next" for the following week, "backlog" for ideas without timing.
- High priority only when the notes signal urgency or a near deadline.
- At most 40 new tasks and 60 task updates.`;
}

/** Read one JSON value from a model reply: whole text, a ``` fence, or the outermost {...}. */
export function extractJson(text: string): unknown {
  const tries = [text.trim()];
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) tries.push(fence[1].trim());
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a !== -1 && b > a) tries.push(text.slice(a, b + 1));
  for (const t of tries) {
    try { return JSON.parse(t); } catch { /* next */ }
  }
  throw new Error("No JSON in reply");
}

type Obj = Record<string, unknown>;
const arr = (x: unknown): Obj[] => (Array.isArray(x) ? x.filter((v): v is Obj => !!v && typeof v === "object") : []);
const str = (x: unknown, n: number) => (typeof x === "string" ? x.trim().slice(0, n) : "");

/**
 * Turn Claude's answer into a safe draft: unknown people, projects and tasks
 * are dropped or cleared, invalid enums and dates fall back to defaults.
 */
export function cleanDraft(
  raw: unknown,
  known: { memberIds: Set<string>; projectIds: Set<string>; tasks: Map<string, { title: string; status: TaskStatus; version: number }> },
): MeetingDraft {
  const o = (raw && typeof raw === "object" ? raw : {}) as Obj;
  const mid = (x: unknown) => (typeof x === "string" && known.memberIds.has(x) ? x : null);
  const summary = Array.isArray(o.summary) ? o.summary.map((x) => str(x, 600)).filter(Boolean).join("\n") : str(o.summary, 12000);
  const people = arr(o.people)
    .map((p) => ({ member_id: mid(p.member_id), update: str(p.update, 1500) }))
    .filter((p): p is DraftPerson => !!p.member_id && !!p.update)
    .slice(0, 40);
  const new_tasks: DraftNewTask[] = arr(o.new_tasks ?? o.newTasks)
    .map((t) => {
      const owner = mid(t.owner_id);
      return {
        include: true,
        title: str(t.title, 200),
        owner_id: owner,
        supporter_ids: (Array.isArray(t.supporter_ids) ? t.supporter_ids : []).map(mid).filter((x): x is string => !!x && x !== owner).slice(0, 20),
        priority: (PRIORITIES as unknown[]).includes(t.priority) ? (t.priority as Priority) : "medium",
        due_date: isIsoDate(t.due_date) ? t.due_date : null,
        week: t.week === "next" || t.week === "backlog" ? t.week : "this",
        status: t.status === "doing" || t.status === "done" ? t.status : "todo",
        project_id: typeof t.project_id === "string" && known.projectIds.has(t.project_id) ? t.project_id : null,
        notes: str(t.notes, 500),
      } satisfies DraftNewTask;
    })
    .filter((t) => t.title)
    .slice(0, 60);
  const task_updates: DraftTaskUpdate[] = [];
  for (const u of arr(o.task_updates ?? o.taskUpdates)) {
    const id = typeof u.task_id === "string" ? u.task_id : "";
    const t = known.tasks.get(id);
    if (!t) continue;
    const status = (STATUSES as unknown[]).includes(u.status) && u.status !== t.status ? (u.status as TaskStatus) : "";
    const note = str(u.note, 1500);
    if (!status && !note) continue;
    task_updates.push({ include: true, task_id: id, task_title: t.title, current_status: t.status, version: t.version, status, note });
    if (task_updates.length >= 60) break;
  }
  return { summary, people, new_tasks, task_updates };
}

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
/** Plain text from a Word document's word/document.xml (one line per paragraph). */
export function docxXmlToText(xml: string): string {
  return xml
    .split(/<\/w:p>/)
    .map((para) =>
      [...para.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)]
        .map((m) => m[1].replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, e: string) =>
          e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : XML_ENTITIES[e.toLowerCase()] ?? "",
        ))
        .join(""),
    )
    .filter((l) => l.trim())
    .join("\n");
}
