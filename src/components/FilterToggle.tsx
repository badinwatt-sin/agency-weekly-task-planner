"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "./Icon";

/** On phones, filters sit behind a button; on larger screens they are always shown. */
export function FilterToggle({ active, children }: { active: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="btn-secondary mb-3 w-full sm:hidden">
        <Icon name="filter" size={16} /> {open ? "Hide filters" : "Filter"}
        {active > 0 && <span className="rounded-full bg-royal-600 px-2 text-xs text-white">{active}</span>}
      </button>
      <div className={open ? "" : "max-sm:hidden"}>{children}</div>
    </>
  );
}
