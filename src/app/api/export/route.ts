import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { todayIso } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { memberName, PRIORITY_LABEL, STATUS_LABEL, type Member, type Priority, type TaskStatus } from "@/lib/types";

// Manager-only export. Reads run as the Manager (row-level security still applies),
// so employee IDs and login emails are never included.

async function all(table: string, columns: string, order: string) {
  const supabase = await createClient();
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(columns).order(order).range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as unknown as Record<string, unknown>[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Neutralise spreadsheet formula injection and quote for CSV. */
function cell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!user.isManager) return NextResponse.json({ error: "Manager only" }, { status: 403 });

  const format = request.nextUrl.searchParams.get("format") === "json" ? "json" : "csv";
  const stamp = todayIso();
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

  const [members, projects, tasks, supporters] = await Promise.all([
    all("members", "id, full_name, display_name, role, is_active, account_status, is_sample, created_at", "sort_order"),
    all("projects", "id, name, color, is_active, is_sample, created_at", "name"),
    all("tasks", "*", "created_at"),
    all("task_supporters", "task_id, member_id", "task_id"),
  ]);

  if (format === "json") {
    const [updates, activity, moves, meetings] = await Promise.all([
      all("task_updates", "*", "created_at"),
      all("task_activity", "*", "id"),
      all("task_week_moves", "*", "id"),
      all("meetings", "*", "meeting_date"),
    ]);
    const body = JSON.stringify(
      { exported_at: new Date().toISOString(), exported_by: memberName(user.member), members, projects, meetings, tasks, task_supporters: supporters, task_updates: updates, task_activity: activity, task_week_moves: moves },
      null,
      2,
    );
    return new NextResponse(body, {
      headers: { ...headers, "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="task-planner-backup-${stamp}.json"` },
    });
  }

  const memberMap = new Map(members.map((m) => [m.id as string, m as unknown as Member]));
  const projectMap = new Map(projects.map((p) => [p.id as string, p.name as string]));
  const supportersBy = new Map<string, string[]>();
  for (const s of supporters) {
    const list = supportersBy.get(s.task_id as string) ?? [];
    list.push(memberName(memberMap.get(s.member_id as string)));
    supportersBy.set(s.task_id as string, list);
  }
  const cols = [
    "Task ID", "Title", "Description", "Project", "Owner", "Supporting members", "Status", "Priority", "Planned week (Mon)", "Start date",
    "Due date", "Completion date", "Effort points", "Times carried over", "Notes", "Links", "Sample", "Archived at", "Created at", "Updated at",
  ];
  const lines = [cols.map(cell).join(",")];
  for (const t of tasks) {
    const links = Array.isArray(t.links) ? (t.links as { label: string; url: string }[]).map((l) => (l.label ? `${l.label}: ${l.url}` : l.url)).join(" ; ") : "";
    lines.push(
      [
        t.id, t.title, t.description, t.project_id ? projectMap.get(t.project_id as string) : "", t.owner_id ? memberName(memberMap.get(t.owner_id as string)) : "Unassigned",
        (supportersBy.get(t.id as string) ?? []).join("; "), STATUS_LABEL[t.status as TaskStatus], PRIORITY_LABEL[t.priority as Priority], t.planned_week, t.start_date,
        t.due_date, t.completed_on, t.effort_points, t.carry_over_count, t.notes, links, t.is_sample ? "yes" : "", t.archived_at, t.created_at, t.updated_at,
      ]
        .map(cell)
        .join(","),
    );
  }
  // BOM so Excel opens UTF-8 (Thai names, etc.) correctly
  return new NextResponse("﻿" + lines.join("\r\n"), {
    headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="tasks-${stamp}.csv"` },
  });
}
