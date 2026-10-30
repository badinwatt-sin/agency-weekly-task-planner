import type { ReactNode } from "react";
import { Icon } from "./Icon";

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-navy-950 via-navy-900 to-royal-700 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3 text-white">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-royal-600">
            <Icon name="board" size={22} />
          </span>
          <div>
            <div className="text-xs font-semibold tracking-widest text-royal-100 uppercase">Agency</div>
            <div className="text-lg leading-tight font-bold">Weekly Task Planner</div>
          </div>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-xl sm:p-7">
          <h1 className="text-lg font-bold text-navy-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          <div className="mt-5">{children}</div>
        </div>
        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-royal-100/80">
          <Icon name="lock" size={12} /> Private workspace · authorised team members only
        </p>
      </div>
    </main>
  );
}
