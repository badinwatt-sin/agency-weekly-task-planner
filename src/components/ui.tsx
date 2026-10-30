import Link from "next/link";
import type { ReactNode } from "react";
import { formatDate } from "@/lib/dates";
import { isOverdue } from "@/lib/filters";
import { memberName, PRIORITY_LABEL, STATUS_LABEL, type Member, type Priority, type Project, type Task, type TaskStatus } from "@/lib/types";
import { Icon, type IconName } from "./Icon";

export const STATUS_STYLE: Record<TaskStatus, { dot: string; badge: string; column: string; bar: string; text: string }> = {
  backlog: { dot: "bg-st-backlog", badge: "bg-slate-100 text-slate-700", column: "md:border-t-st-backlog", bar: "#64748b", text: "text-st-backlog" },
  todo: { dot: "bg-st-todo", badge: "bg-royal-50 text-royal-700", column: "md:border-t-st-todo", bar: "#2952cc", text: "text-st-todo" },
  doing: { dot: "bg-st-doing", badge: "bg-amber-50 text-amber-800", column: "md:border-t-st-doing", bar: "#c27803", text: "text-st-doing" },
  done: { dot: "bg-st-done", badge: "bg-emerald-50 text-emerald-800", column: "md:border-t-st-done", bar: "#0f8a5f", text: "text-st-done" },
};

const PRIORITY_STYLE: Record<Priority, string> = {
  high: "bg-red-50 text-red-700 ring-red-200",
  medium: "bg-amber-50 text-amber-800 ring-amber-200",
  low: "bg-slate-50 text-slate-600 ring-slate-200",
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${s.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${PRIORITY_STYLE[priority]}`}>
      <Icon name="flag" size={11} />
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

export function SampleBadge() {
  return <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-violet-800 uppercase">Sample</span>;
}

export function DueBadge({ task, today }: { task: Pick<Task, "status" | "due_date">; today: string }) {
  if (!task.due_date) return null;
  const overdue = isOverdue(task, today);
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${overdue ? "text-st-overdue" : "text-muted"}`}>
      <Icon name={overdue ? "alert" : "clock"} size={12} />
      {overdue ? "Overdue · " : "Due "}
      {formatDate(task.due_date)}
    </span>
  );
}

export function Avatar({ member, size = "md" }: { member: Pick<Member, "full_name" | "display_name"> | null | undefined; size?: "sm" | "md" }) {
  const name = memberName(member);
  const initials = member
    ? name
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase())
        .join("")
    : "–";
  const dims = size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs";
  return (
    <span title={name} className={`inline-flex ${dims} shrink-0 items-center justify-center rounded-full bg-navy-800 font-semibold text-white`}>
      {initials}
    </span>
  );
}

export function ProjectTag({ project }: { project: Project | undefined }) {
  if (!project) return null;
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 truncate text-xs font-medium text-muted">
      <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: project.color }} aria-hidden />
      <span className="truncate">{project.name}</span>
    </span>
  );
}

export function PageHeader({ title, subtitle, icon, actions }: { title: string; subtitle?: ReactNode; icon?: IconName; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-navy-900 sm:text-2xl">
          {icon && <Icon name={icon} size={22} className="text-royal-600" />}
          {title}
        </h1>
        {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-white/60 p-8 text-center">
      <p className="font-semibold text-navy-900">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error" | "success"; children: ReactNode }) {
  const styles = {
    info: "border-royal-100 bg-royal-50 text-navy-800",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    error: "border-red-200 bg-red-50 text-red-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm ${styles}`}>
      {children}
    </div>
  );
}

export function Stat({ label, value, sub, href, tone }: { label: string; value: ReactNode; sub?: ReactNode; href?: string; tone?: TaskStatus | "overdue" }) {
  const accent = tone === "overdue" ? "text-st-overdue" : tone ? { backlog: "text-st-backlog", todo: "text-st-todo", doing: "text-st-doing", done: "text-st-done" }[tone] : "text-navy-900";
  const inner = (
    <>
      <div className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${accent}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="card block p-4 transition hover:border-royal-500 hover:shadow-sm">
      {inner}
    </Link>
  ) : (
    <div className="card p-4">{inner}</div>
  );
}
