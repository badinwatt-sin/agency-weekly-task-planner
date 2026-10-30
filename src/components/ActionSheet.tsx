"use client";

import { useEffect, useRef } from "react";

export interface SheetItem {
  label: string;
  sub?: string;
  dot?: string; // a CSS colour for a small status swatch
  current?: boolean;
  onSelect: () => void;
}

/** Phone-style menu that slides up from the bottom of the screen. */
export function ActionSheet({ title, items, onClose }: { title?: string; items: SheetItem[]; onClose: () => void }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-950/50" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title || "Menu"} className="w-full max-w-lg rounded-t-2xl bg-white px-3 pt-2 pb-[calc(12px+env(safe-area-inset-bottom))] shadow-xl">
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-line" />
        {title && <p className="mb-1 text-center text-sm font-semibold break-words text-muted">{title}</p>}
        <div className="flex flex-col gap-1">
          {items.map((it, i) => (
            <button
              key={it.label}
              ref={i === 0 ? first : undefined}
              type="button"
              aria-current={it.current ? "true" : undefined}
              onClick={() => { onClose(); it.onSelect(); }}
              className={`flex min-h-13 items-center gap-3 rounded-xl px-4 py-2 text-left text-base font-semibold ${it.current ? "bg-royal-50 text-royal-700" : "hover:bg-canvas"}`}
            >
              {it.dot && <span className="h-3 w-3 shrink-0 rounded" style={{ background: it.dot }} aria-hidden />}
              <span>
                {it.label}
                {it.sub && <span className="block text-sm font-normal text-muted">{it.sub}</span>}
              </span>
            </button>
          ))}
          <button type="button" onClick={onClose} className="min-h-12 rounded-xl text-base font-semibold text-muted hover:bg-canvas">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
