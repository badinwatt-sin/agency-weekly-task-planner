import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PageHeader, STATUS_STYLE } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getMembers, getTasks } from "@/lib/data";
import { addMonths, formatDate, formatMonth, isMonthKey, monthGrid, todayIso } from "@/lib/dates";
import { filterTasks, isOverdue, parseFilters, taskListHref } from "@/lib/filters";
import { memberName, STATUSES, STATUS_LABEL, type Task } from "@/lib/types";

export const metadata = { title: "Calendar" };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_PER_DAY = 3;

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser();
  const sp = await searchParams;
  const today = todayIso();
  const month = isMonthKey(sp.month) ? sp.month : today.slice(0, 7);
  const by: "due" | "start" = sp.by === "start" ? "start" : "due";
  const { owner, status } = parseFilters(sp);

  const [tasks, members] = await Promise.all([getTasks(), getMembers()]);
  const memberMap = new Map(members.map((m) => [m.id, m]));
  const visible = filterTasks(tasks, { owner, status }, today);
  const dateOf = (t: Task) => (by === "due" ? t.due_date : t.start_date);
  const byDay = new Map<string, Task[]>();
  for (const t of visible) {
    const d = dateOf(t);
    if (!d || d.slice(0, 7) !== month) continue;
    byDay.set(d, [...(byDay.get(d) ?? []), t]);
  }
  const weeks = monthGrid(month);

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { month, by, owner, status: status?.join(","), ...patch };
    Object.entries(merged).forEach(([k, v]) => v && p.set(k, v));
    return `/calendar?${p.toString()}`;
  };
  const dayHref = (d: string) => taskListHref({ owner, status, dateField: by, from: d, to: d });

  const chip = (t: Task) => (
    <Link
      key={t.id}
      href={`/tasks/${t.id}`}
      title={`${t.title} · ${memberName(t.owner_id ? memberMap.get(t.owner_id) : null)} · ${STATUS_LABEL[t.status]}`}
      className={`flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-[11px] font-medium hover:ring-1 hover:ring-royal-500 ${
        isOverdue(t, today) ? "bg-red-50 text-red-800" : t.status === "done" ? "bg-emerald-50 text-emerald-900 line-through decoration-emerald-700/40" : "bg-royal-50 text-navy-900"
      }`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_STYLE[t.status].dot}`} aria-hidden />
      <span className="truncate">{t.title}</span>
    </Link>
  );

  return (
    <>
      <PageHeader title="Calendar" icon="calendar" subtitle={`Tasks placed by ${by === "due" ? "due date" : "start date"}. Click a day number to list that day's tasks.`} />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex items-center rounded-lg border border-line bg-white shadow-xs">
          <Link href={qs({ month: addMonths(month, -1) })} className="rounded-l-lg p-2 hover:bg-royal-50" aria-label="Previous month">
            <Icon name="left" />
          </Link>
          <span className="min-w-40 px-2 text-center font-semibold text-navy-900">{formatMonth(month)}</span>
          <Link href={qs({ month: addMonths(month, 1) })} className="rounded-r-lg p-2 hover:bg-royal-50" aria-label="Next month">
            <Icon name="right" />
          </Link>
        </div>
        {month !== today.slice(0, 7) && (
          <Link href={qs({ month: today.slice(0, 7) })} className="btn-ghost btn-sm w-fit">
            Today
          </Link>
        )}
        <form method="get" className="flex flex-wrap items-center gap-2 lg:ml-auto">
          <input type="hidden" name="month" value={month} />
          <select name="by" defaultValue={by} aria-label="Show tasks by">
            <option value="due">By due date</option>
            <option value="start">By start date</option>
          </select>
          <select name="owner" defaultValue={owner ?? ""} aria-label="Owner">
            <option value="">All owners</option>
            <option value="none">Unassigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {memberName(m)}
              </option>
            ))}
          </select>
          <select name="status" defaultValue={status?.join(",") ?? ""} aria-label="Status">
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
            <option value="backlog,todo,doing">Not done</option>
          </select>
          <button className="btn-primary btn-sm">Apply</button>
        </form>
      </div>

      {/* Month grid: tablet and desktop */}
      <div className="card hidden overflow-hidden md:block">
        <div className="grid grid-cols-7 border-b border-line bg-canvas text-center text-xs font-semibold text-muted uppercase">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>
        {weeks.map((w) => (
          <div key={w[0]} className="grid grid-cols-7 border-b border-line last:border-b-0">
            {w.map((d) => {
              const items = byDay.get(d) ?? [];
              const inMonth = d.slice(0, 7) === month;
              return (
                <div key={d} className={`min-h-28 border-r border-line p-1.5 last:border-r-0 ${inMonth ? "" : "bg-canvas/60"} ${d === today ? "bg-royal-50/60" : ""}`}>
                  <div className="mb-1 flex items-center justify-between">
                    {items.length > 0 ? (
                      <Link href={dayHref(d)} className={`text-xs font-semibold hover:underline ${d === today ? "rounded-full bg-royal-600 px-1.5 text-white" : inMonth ? "text-navy-900" : "text-muted"}`}>
                        {Number(d.slice(8))}
                      </Link>
                    ) : (
                      <span className={`text-xs font-semibold ${d === today ? "rounded-full bg-royal-600 px-1.5 text-white" : inMonth ? "text-navy-900" : "text-muted"}`}>{Number(d.slice(8))}</span>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    {items.slice(0, MAX_PER_DAY).map(chip)}
                    {items.length > MAX_PER_DAY && (
                      <Link href={dayHref(d)} className="block px-1 text-[11px] font-semibold text-royal-700 hover:underline">
                        +{items.length - MAX_PER_DAY} more
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Agenda list: phones */}
      <div className="space-y-3 md:hidden">
        {[...byDay.keys()].sort().length === 0 && <p className="card p-6 text-center text-sm text-muted">No tasks this month for these filters.</p>}
        {[...byDay.keys()].sort().map((d) => (
          <section key={d} className="card p-3">
            <h2 className={`mb-2 text-sm font-bold ${d === today ? "text-royal-700" : "text-navy-900"}`}>
              {formatDate(d, { weekday: true })}
              {d === today && " · Today"}
            </h2>
            <div className="space-y-1">{byDay.get(d)!.map(chip)}</div>
          </section>
        ))}
      </div>
    </>
  );
}
