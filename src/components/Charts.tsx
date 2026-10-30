import Link from "next/link";
import type { ReactNode } from "react";

// Lightweight HTML/CSS charts: crisp at any width, every bar is a drill-down link.

export interface Bar {
  value: number;
  color: string;
  href?: string;
  title: string;
}

export function Legend({ items }: { items: { label: string; color: string; pattern?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: i.color }} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

function BarLink({ bar, style, className }: { bar: Bar; style: React.CSSProperties; className: string }) {
  const content = <span className="sr-only">{bar.title}</span>;
  return bar.href && bar.value > 0 ? (
    <Link href={bar.href} title={bar.title} style={style} className={`${className} transition hover:opacity-80 focus-visible:opacity-80`}>
      {content}
    </Link>
  ) : (
    <span title={bar.title} style={style} className={className}>
      {content}
    </span>
  );
}

/** Grouped vertical bars (e.g. planned vs completed per week). */
export function ColumnChart({ groups, height = 180 }: { groups: { label: string; sub?: string; bars: Bar[] }[]; height?: number }) {
  const max = Math.max(1, ...groups.flatMap((g) => g.bars.map((b) => b.value)));
  return (
    <div className="relative overflow-x-auto">
      <div className="flex min-w-full items-end gap-2" style={{ minWidth: `${groups.length * 30}px` }}>
        {groups.map((g) => (
          <div key={g.label} className="flex min-w-6 flex-1 flex-col items-center">
            <div className="flex w-full items-end justify-center gap-0.5" style={{ height }}>
              {g.bars.map((b, i) => (
                <div key={i} className="flex h-full max-w-5 flex-1 flex-col items-center justify-end">
                  <span className="mb-0.5 text-[10px] font-semibold text-muted">{b.value || ""}</span>
                  <BarLink bar={b} className="block w-full rounded-t" style={{ height: `${(b.value / max) * 100}%`, minHeight: b.value ? 2 : 0, backgroundColor: b.color }} />
                </div>
              ))}
            </div>
            <div className="mt-1 w-full border-t border-line pt-1 text-center text-[11px] leading-tight text-muted">
              {g.label}
              {g.sub && <div className="text-[10px]">{g.sub}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Horizontal stacked bars (e.g. status per person). */
export function StackedRows({ rows, max: maxOverride, valueLabel }: { rows: { label: ReactNode; key: string; segments: Bar[]; total: ReactNode }[]; max?: number; valueLabel?: string }) {
  const max = maxOverride ?? Math.max(1, ...rows.map((r) => r.segments.reduce((a, s) => a + s.value, 0)));
  return (
    <ul className="relative space-y-2">
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[minmax(0,12rem)_1fr_auto]">
          <span className="truncate">{r.label}</span>
          <span className="relative flex h-4 overflow-hidden rounded bg-canvas" aria-label={valueLabel}>
            {r.segments.map((s, i) => (
              <BarLink key={i} bar={s} className="block h-full" style={{ width: `${(s.value / max) * 100}%`, backgroundColor: s.color }} />
            ))}
          </span>
          <span className="w-16 text-right text-xs font-semibold tabular-nums">{r.total}</span>
        </li>
      ))}
    </ul>
  );
}

export function ChartCard({ title, subtitle, children, legend }: { title: string; subtitle?: ReactNode; children: ReactNode; legend?: ReactNode }) {
  return (
    <section className="card min-w-0 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-bold text-navy-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
        {legend}
      </div>
      {children}
    </section>
  );
}
