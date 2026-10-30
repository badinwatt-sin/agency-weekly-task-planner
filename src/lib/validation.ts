import { z } from "zod";
import { isIsoDate, isMonday } from "./dates";
import { PRIORITIES, STATUSES, type TaskLink } from "./types";

const uuid = z.string().uuid();
const optionalUuid = z.union([uuid, z.null()]);
const isoDate = z.string().refine(isIsoDate, "Use a valid date");
const optionalDate = z.union([isoDate, z.null()]);
const optionalText = (max: number) => z.union([z.string().trim().max(max, `Keep this under ${max} characters`), z.null()]);

export const linkSchema = z.object({
  label: z.string().trim().max(100),
  url: z
    .string()
    .trim()
    .max(2000)
    .url("Links must be full web addresses")
    .refine((u) => /^https?:\/\//i.test(u), "Links must start with http:// or https://"),
});

export const taskInputSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200, "Keep the title under 200 characters"),
    description: optionalText(5000),
    project_id: optionalUuid,
    owner_id: optionalUuid,
    supporter_ids: z.array(uuid).max(20, "Up to 20 supporting members"),
    status: z.enum(STATUSES as [string, ...string[]]),
    priority: z.enum(PRIORITIES as [string, ...string[]]),
    planned_week: z.union([z.string().refine(isMonday, "Planned week must be a Monday"), z.null()]),
    start_date: optionalDate,
    due_date: optionalDate,
    completed_on: optionalDate,
    effort_points: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(5), z.literal(8), z.null()]),
    notes: optionalText(10000),
    links: z.array(linkSchema).max(10, "Up to 10 links"),
  })
  .superRefine((v, ctx) => {
    if (v.start_date && v.due_date && v.due_date < v.start_date) {
      ctx.addIssue({ code: "custom", path: ["due_date"], message: "Due date can't be before the start date" });
    }
    if (v.status !== "backlog" && !v.planned_week) {
      ctx.addIssue({ code: "custom", path: ["planned_week"], message: "Choose a planned week (only Backlog tasks can be unscheduled)" });
    }
    if (v.owner_id && v.supporter_ids.includes(v.owner_id)) {
      ctx.addIssue({ code: "custom", path: ["supporter_ids"], message: "The owner is already on the task" });
    }
  });

export type TaskInput = z.infer<typeof taskInputSchema>;

/** "Label | https://…" or a bare URL, one per line. */
export function parseLinks(raw: string): TaskLink[] {
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const i = line.lastIndexOf("|");
      if (i === -1) return { label: "", url: line };
      return { label: line.slice(0, i).trim(), url: line.slice(i + 1).trim() };
    });
}

export function linksToText(links: TaskLink[]): string {
  return links.map((l) => (l.label ? `${l.label} | ${l.url}` : l.url)).join("\n");
}

const str = (fd: FormData, key: string): string | null => {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
};

export function taskInputFromForm(fd: FormData) {
  const effort = str(fd, "effort_points");
  return {
    title: str(fd, "title") ?? "",
    description: str(fd, "description"),
    project_id: str(fd, "project_id"),
    owner_id: str(fd, "owner_id"),
    supporter_ids: fd.getAll("supporter_ids").filter((v): v is string => typeof v === "string" && v !== ""),
    status: str(fd, "status") ?? "backlog",
    priority: str(fd, "priority") ?? "medium",
    planned_week: str(fd, "planned_week"),
    start_date: str(fd, "start_date"),
    due_date: str(fd, "due_date"),
    completed_on: str(fd, "completed_on"),
    effort_points: effort ? Number(effort) : null,
    notes: str(fd, "notes"),
    links: parseLinks(str(fd, "links") ?? ""),
  };
}

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export const memberInputSchema = z.object({
  full_name: z.string().trim().min(1, "Name is required").max(120),
  display_name: optionalText(60),
  role: z.enum(["member", "manager"]),
});

export const accountSetupSchema = z.object({
  member_id: uuid,
  // Format is agency-specific; we only check it is a sensible identifier.
  employee_id: z
    .string()
    .trim()
    .min(1, "Employee ID is required")
    .max(64)
    .regex(/^[A-Za-z0-9._\-\/]+$/, "Use letters, numbers, dots, dashes, slashes or underscores"),
  email: z.string().trim().toLowerCase().email("Enter the person's work email").max(254),
});

export const projectInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Pick a colour"),
});

export const updateInputSchema = z.object({
  task_id: uuid,
  kind: z.enum(["comment", "progress"]),
  body: z.string().trim().min(1, "Write something first").max(4000),
});

/** Password rules. Supabase stores only a salted bcrypt hash. */
export function passwordProblem(password: string, confirm: string, employeeId?: string | null): string | null {
  if (password !== confirm) return "The two passwords don't match.";
  if (password.length < 12) return "Use at least 12 characters.";
  if (password.length > 72) return "Use 72 characters or fewer.";
  if (/^(.)\1+$/.test(password)) return "Choose a less predictable password.";
  const lower = password.toLowerCase();
  if (employeeId && lower.includes(employeeId.toLowerCase())) return "Your password must not contain your employee ID.";
  const weak = ["password", "123456", "qwerty", "letmein", "welcome", "agency", "planner", "admin"];
  if (weak.some((w) => lower.includes(w)) && password.length < 16) return "Avoid common words — try a short phrase of unrelated words.";
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  if (password.length < 16 && classes < 3) return "Mix upper- and lower-case letters, numbers or symbols — or use 16+ characters.";
  return null;
}
