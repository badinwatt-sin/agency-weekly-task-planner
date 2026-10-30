"use client";

import { useState } from "react";
import { memberName, type Member } from "@/lib/types";
import { Icon } from "./Icon";

/** Repeating rows for meeting action items. Submitted as parallel item_* fields. */
export function ActionItemsEditor({ members, initialRows = 3 }: { members: Member[]; initialRows?: number }) {
  const [rows, setRows] = useState(() => Array.from({ length: initialRows }, (_, i) => i));
  const [next, setNext] = useState(initialRows);
  return (
    <div className="space-y-2">
      <div className="hidden grid-cols-[1fr_11rem_7rem_9rem_9rem_2rem] gap-2 px-1 text-xs font-semibold text-muted uppercase lg:grid">
        <span>Action item</span>
        <span>Owner</span>
        <span>Priority</span>
        <span>Due</span>
        <span>Add to</span>
        <span />
      </div>
      {rows.map((key, idx) => (
        <fieldset key={key} className="grid grid-cols-2 gap-2 rounded-lg border border-line bg-canvas/50 p-2 lg:grid-cols-[1fr_11rem_7rem_9rem_9rem_2rem] lg:border-0 lg:bg-transparent lg:p-0">
          <legend className="sr-only">Action item {idx + 1}</legend>
          <input name="item_title" placeholder={`Action item ${idx + 1}`} maxLength={200} aria-label={`Action item ${idx + 1} title`} className="col-span-2 lg:col-span-1" />
          <select name="item_owner" aria-label="Owner" defaultValue="">
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {memberName(m)}
              </option>
            ))}
          </select>
          <select name="item_priority" aria-label="Priority" defaultValue="medium">
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <input name="item_due" type="date" aria-label="Due date" />
          <select name="item_target" aria-label="Add to" defaultValue="this">
            <option value="this">Meeting week</option>
            <option value="next">Following week</option>
            <option value="backlog">Backlog</option>
          </select>
          <button
            type="button"
            onClick={() => setRows((r) => r.filter((k) => k !== key))}
            className="col-span-2 flex items-center justify-center rounded-md p-2 text-muted hover:bg-red-50 hover:text-red-700 lg:col-span-1"
            aria-label={`Remove action item ${idx + 1}`}
          >
            <Icon name="x" size={16} />
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="btn-ghost btn-sm"
        onClick={() => {
          setRows((r) => [...r, next]);
          setNext((n) => n + 1);
        }}
      >
        <Icon name="plus" size={14} /> Add another
      </button>
    </div>
  );
}
