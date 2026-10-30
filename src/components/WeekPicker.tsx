import Link from "next/link";
import { addDays, formatWeek } from "@/lib/dates";
import { Icon } from "./Icon";

export function WeekPicker({ path, week, thisWeek, keep = {} }: { path: string; week: string; thisWeek: string; keep?: Record<string, string | undefined> }) {
  const href = (w: string) => {
    const p = new URLSearchParams();
    Object.entries(keep).forEach(([k, v]) => v && p.set(k, v));
    p.set("week", w);
    return `${path}?${p.toString()}`;
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center rounded-lg border border-line bg-white shadow-xs">
        <Link href={href(addDays(week, -7))} className="rounded-l-lg p-2 hover:bg-royal-50" aria-label="Previous week">
          <Icon name="left" />
        </Link>
        <span className="min-w-52 px-2 text-center text-sm font-semibold text-navy-900">{formatWeek(week)}</span>
        <Link href={href(addDays(week, 7))} className="rounded-r-lg p-2 hover:bg-royal-50" aria-label="Next week">
          <Icon name="right" />
        </Link>
      </div>
      {week !== thisWeek && (
        <Link href={href(thisWeek)} className="btn-ghost btn-sm">
          This week
        </Link>
      )}
      <form method="get" action={path} className="flex items-center gap-1">
        {Object.entries(keep).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
        <label htmlFor="jump-week" className="sr-only">
          Jump to week containing date
        </label>
        <input id="jump-week" type="date" name="date" className="min-h-9 py-1 text-xs" />
        <button className="btn-ghost btn-sm">Go</button>
      </form>
    </div>
  );
}
