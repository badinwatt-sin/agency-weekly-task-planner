"use client";

import { useActionState, useState, useTransition, type FormEvent } from "react";
import { createTask, updateTask, type TaskFormState } from "@/app/(app)/tasks/actions";
import { addDays, formatWeek } from "@/lib/dates";
import { EFFORT_OPTIONS, memberName, PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL, type Member, type Project, type Task, type TaskStatus } from "@/lib/types";
import { linksToText } from "@/lib/validation";
import { Icon } from "./Icon";
import { Notice } from "./ui";

interface Props {
  task?: Task;
  members: Member[];
  projects: Project[];
  thisWeek: string;
  defaults?: { status?: TaskStatus; planned_week?: string | null; meeting_id?: string; owner_id?: string };
  readOnly?: boolean;
}

function weekOptions(thisWeek: string, current: string | null | undefined): string[] {
  const set = new Set<string>();
  for (let i = -8; i <= 26; i++) set.add(addDays(thisWeek, i * 7));
  if (current) set.add(current);
  return [...set].sort();
}

export function TaskForm({ task, members, projects, thisWeek, defaults = {}, readOnly = false }: Props) {
  const editing = !!task;
  const [state, run, actionPending] = useActionState<TaskFormState, FormData>(editing ? updateTask : createTask, null);
  const [transitionPending, startTransition] = useTransition();
  const pending = actionPending || transitionPending;
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? defaults.status ?? "todo");
  const [week, setWeek] = useState<string>(task?.planned_week ?? (defaults.planned_week === undefined ? thisWeek : (defaults.planned_week ?? "")));
  const [owner, setOwner] = useState<string>(task?.owner_id ?? defaults.owner_id ?? "");
  const version = state?.ok ? state.data.version : task?.version;
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const activeMembers = members.filter((m) => m.is_active || m.id === task?.owner_id || task?.supporter_ids.includes(m.id));
  const activeProjects = projects.filter((p) => p.is_active || p.id === task?.project_id);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => run(fd));
  }

  function onStatus(next: TaskStatus) {
    setStatus(next);
    if (next !== "backlog" && !week) setWeek(thisWeek);
  }

  const err = (k: string) => errors[k] && <p className="field-error">{errors[k]}</p>;

  return (
    <form onSubmit={onSubmit} className="space-y-5" aria-describedby="task-form-status">
      {task && <input type="hidden" name="id" value={task.id} />}
      {version != null && <input type="hidden" name="version" value={version} />}
      {defaults.meeting_id && <input type="hidden" name="meeting_id" value={defaults.meeting_id} />}

      <div id="task-form-status" aria-live="polite" className="empty:hidden">
        {state && !state.ok && (
          <Notice tone={state.conflict ? "warn" : "error"}>
            <p className="font-semibold">{state.conflict ? "Someone else changed this task" : "Not saved"}</p>
            <p className="mt-1">{state.error}</p>
            {state.conflict && (
              <button type="button" className="btn-secondary btn-sm mt-2" onClick={() => window.location.reload()}>
                Reload latest version
              </button>
            )}
          </Notice>
        )}
        {state?.ok && <Notice tone="success">Saved.</Notice>}
      </div>

      <fieldset disabled={readOnly || pending} className="space-y-5">
        <div>
          <label htmlFor="title">Task title *</label>
          <input id="title" name="title" required maxLength={200} defaultValue={task?.title} className="mt-1 w-full text-base" />
          {err("title")}
        </div>

        <div>
          <label htmlFor="description">Description</label>
          <textarea id="description" name="description" rows={3} maxLength={5000} defaultValue={task?.description ?? ""} className="mt-1 w-full" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label htmlFor="project_id">Project / category</label>
            <select id="project_id" name="project_id" defaultValue={task?.project_id ?? ""} className="mt-1 w-full">
              <option value="">— None —</option>
              {activeProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="owner_id">Owner</label>
            <select id="owner_id" name="owner_id" value={owner} onChange={(e) => setOwner(e.target.value)} className="mt-1 w-full">
              <option value="">— Unassigned —</option>
              {activeMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {memberName(m)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="priority">Priority</label>
            <select id="priority" name="priority" defaultValue={task?.priority ?? "medium"} className="mt-1 w-full">
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <details className="rounded-lg border border-line bg-canvas/60 p-3" open={(task?.supporter_ids.length ?? 0) > 0}>
          <summary className="cursor-pointer text-sm font-medium">
            Supporting members <span className="text-muted">(optional{task?.supporter_ids.length ? ` · ${task.supporter_ids.length} selected` : ""})</span>
          </summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {activeMembers
              .filter((m) => m.id !== owner)
              .map((m) => (
                <label key={m.id} className="flex items-center gap-2 font-normal">
                  <input type="checkbox" name="supporter_ids" value={m.id} defaultChecked={task?.supporter_ids.includes(m.id)} />
                  {memberName(m)}
                </label>
              ))}
          </div>
          {err("supporter_ids")}
        </details>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="status">Status</label>
            <select id="status" name="status" value={status} onChange={(e) => onStatus(e.target.value as TaskStatus)} className="mt-1 w-full">
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-1 lg:col-span-3">
            <label htmlFor="planned_week">Planned week</label>
            <select id="planned_week" name="planned_week" value={week} onChange={(e) => setWeek(e.target.value)} className="mt-1 w-full">
              <option value="">— Not scheduled (Backlog) —</option>
              {weekOptions(thisWeek, task?.planned_week).map((w) => (
                <option key={w} value={w}>
                  {formatWeek(w)}
                  {w === thisWeek ? " (this week)" : ""}
                </option>
              ))}
            </select>
            {err("planned_week")}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="start_date">Start date</label>
            <input id="start_date" name="start_date" type="date" defaultValue={task?.start_date ?? ""} className="mt-1 w-full" />
          </div>
          <div>
            <label htmlFor="due_date">Due date</label>
            <input id="due_date" name="due_date" type="date" defaultValue={task?.due_date ?? ""} className="mt-1 w-full" />
            {err("due_date")}
          </div>
          <div>
            <label htmlFor="completed_on">Completion date</label>
            <input
              id="completed_on"
              name="completed_on"
              type="date"
              defaultValue={task?.completed_on ?? ""}
              disabled={status !== "done"}
              className="mt-1 w-full disabled:bg-canvas"
            />
            <p className="mt-1 text-xs text-muted">{status === "done" ? "Defaults to today when marked Done." : "Set automatically when Done."}</p>
          </div>
        </div>

        <div>
          <label htmlFor="effort_points">Effort estimate (optional)</label>
          <select id="effort_points" name="effort_points" defaultValue={task?.effort_points ?? ""} className="mt-1 w-full sm:w-80">
            <option value="">— Not estimated —</option>
            {EFFORT_OPTIONS.map((o) => (
              <option key={o.points} value={o.points}>
                {o.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted">A rough size of the work, used for workload planning — not a measure of value or performance.</p>
        </div>

        <div>
          <label htmlFor="notes">Notes</label>
          <textarea id="notes" name="notes" rows={3} maxLength={10000} defaultValue={task?.notes ?? ""} className="mt-1 w-full" />
        </div>

        <div>
          <label htmlFor="links">Supporting links</label>
          <textarea
            id="links"
            name="links"
            rows={2}
            defaultValue={task ? linksToText(task.links) : ""}
            placeholder={"Brief | https://drive.example.com/…\nhttps://…"}
            className="mt-1 w-full font-mono text-xs"
          />
          <p className="mt-1 text-xs text-muted">One per line. Optional label before a “|”.</p>
          {err("links")}
        </div>
      </fieldset>

      {!readOnly && (
        <div className="sticky bottom-[calc(72px+env(safe-area-inset-bottom))] z-10 -mx-4 flex flex-wrap gap-2 border-t border-line bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0">
          <button type="submit" className="btn-primary flex-1 sm:flex-none" disabled={pending}>
            <Icon name="check" size={16} />
            {pending ? "Saving…" : editing ? "Save changes" : "Create task"}
          </button>
        </div>
      )}
    </form>
  );
}
