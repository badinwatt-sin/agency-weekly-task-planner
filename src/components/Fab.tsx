"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { ActionSheet } from "./ActionSheet";
import { Icon } from "./Icon";

/** Floating “+” button for the Manager on phones and tablets. */
export function Fab() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const path = usePathname();
  // Pages that already have their own Save button at the bottom of the screen
  if (path.startsWith("/tasks/") || path.startsWith("/meetings/new")) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Add"
        className="fixed right-[max(16px,env(safe-area-inset-right))] bottom-[calc(80px+env(safe-area-inset-bottom))] z-30 grid h-14 w-14 place-items-center rounded-2xl bg-royal-600 text-white shadow-lg shadow-navy-900/30 lg:hidden"
      >
        <Icon name="plus" size={26} />
      </button>
      {open && (
        <ActionSheet
          onClose={() => setOpen(false)}
          items={[
            { label: "New task", sub: "Add work to this week's board", onSelect: () => router.push("/tasks/new") },
            { label: "Record a meeting", sub: "Paste or upload notes, Claude drafts the tasks", onSelect: () => router.push("/meetings/new") },
          ]}
        />
      )}
    </>
  );
}
