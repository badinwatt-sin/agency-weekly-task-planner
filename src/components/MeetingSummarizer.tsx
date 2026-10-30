"use client";

import { useRef, useState, useTransition } from "react";
import { saveMeetingDraft, summarizeNotes, type DraftToSave } from "@/app/(app)/meetings/actions";
import type { MeetingDraft } from "@/lib/ai-draft";
import { formatWeek, weekStart } from "@/lib/dates";
import { memberName, PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL, type Member, type Project } from "@/lib/types";
import { Icon } from "./Icon";
import { Notice, StatusBadge } from "./ui";

const ACCEPT = ".txt,.md,.csv,.tsv,.json,.docx,text/plain,text/markdown,text/csv,image/png,image/jpeg,image/webp,image/gif";
// Hosting platforms cap one request at ~4.5 MB (Vercel), so photos are shrunk in the
// browser first. 1600 px on the long side is still sharp enough for Claude to read text.
const MAX_SIDE = 1600;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;

async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 700_000) {
      bmp.close();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#ffffff"; // transparent screenshots → white, not black, in JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" });
  } catch {
    return file; // the server still checks size and type
  }
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function MeetingSummarizer({ members, projects, today, enabled }: { members: Member[]; projects: Project[]; today: string; enabled: boolean }) {
  const [title, setTitle] = useState("Weekly team meeting");
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [draft, setDraft] = useState<MeetingDraft | null>(null);
  const [error, setError] = useState("");
  const [busy, startBusy] = useTransition();
  const [saving, startSaving] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const memberOpts = members.filter((m) => m.is_active);

  const [preparing, setPreparing] = useState(false);

  async function addFiles(list: FileList | null) {
    if (!list || !list.length) return;
    const picked = Array.from(list);
    if (fileRef.current) fileRef.current.value = "";
    setPreparing(true);
    try {
      const ready = await Promise.all(picked.map(shrinkImage));
      setFiles((current) => {
        const next = [...current];
        for (const f of ready) if (!next.some((x) => x.name === f.name && x.size === f.size)) next.push(f);
        return next.slice(0, 10);
      });
    } finally {
      setPreparing(false);
    }
  }

  function summarize() {
    setError("");
    if (!notes.trim() && !files.length) { setError("Paste the notes or upload a file first."); return; }
    const total = files.reduce((n, f) => n + f.size, 0) + new Blob([notes]).size;
    if (total > MAX_TOTAL_BYTES) {
      setError(`The notes and files add up to ${mb(total)}; the limit is ${mb(MAX_TOTAL_BYTES)} per summary. Remove a file, or summarize in two parts.`);
      return;
    }
    const fd = new FormData();
    fd.set("meeting_date", date);
    fd.set("notes", notes);
    files.forEach((f) => fd.append("files", f));
    startBusy(async () => {
      const res = await summarizeNotes(fd);
      if (res.ok) setDraft(res.data);
      else setError(res.error);
    });
  }

  function save() {
    if (!draft) return;
    setError("");
    const payload: DraftToSave = {
      title, meeting_date: date, summary: draft.summary, people: draft.people,
      new_tasks: draft.new_tasks,
      task_updates: draft.task_updates.map(({ include, task_id, version, status, note }) => ({ include, task_id, version, status, note })),
    };
    startSaving(async () => {
      const res = await saveMeetingDraft(payload);
      if (res && !res.ok) setError(res.error);
    });
  }

  const upd = <K extends keyof MeetingDraft>(k: K, v: MeetingDraft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  return (
    <div className="space-y-5">
      <section className="card space-y-4 p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
          <div>
            <label htmlFor="ms-title">Meeting title</label>
            <input id="ms-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} className="mt-1 w-full" />
          </div>
          <div>
            <label htmlFor="ms-date">Meeting date</label>
            <input id="ms-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full" />
            {date && <p className="mt-1 text-xs text-muted">Tasks go into {formatWeek(weekStart(date))}</p>}
          </div>
        </div>
        <div>
          <label htmlFor="ms-notes">Notes from the meeting</label>
          <textarea
            id="ms-notes"
            rows={10}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 w-full"
            placeholder={"Paste each person's update, in Thai or English. For example:\n\nนุ่น: ส่ง brief ลูกค้า A แล้ว รอ feedback / สัปดาห์นี้ทำ media plan ให้เสร็จวันศุกร์\nTon: still collecting supplier quotes, needs help from Mint"}
          />
        </div>
        <div>
          <span className="text-sm font-medium">Or upload files</span>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()} disabled={preparing}>
              <Icon name="folder" size={16} /> {preparing ? "Preparing…" : "Choose files…"}
            </button>
            <input ref={fileRef} type="file" multiple accept={ACCEPT} hidden onChange={(e) => void addFiles(e.target.files)} />
            <span className="text-xs text-muted">Text, CSV, Word (.docx), or photos / screenshots of notes such as a LINE chat (resized automatically). Up to 4 MB in total. For a PDF, paste its text above.</span>
          </div>
          {files.length > 0 && (
            <ul className="mt-2 space-y-1">
              {files.map((f, i) => (
                <li key={f.name + i} className="flex items-center gap-2 text-sm">
                  <span className="rounded bg-canvas px-1.5 py-0.5 text-xs font-semibold text-muted">{f.type.startsWith("image/") ? "Image" : "Text"}</span>
                  <span className="min-w-0 break-all">{f.name}</span>
                  <span className="text-xs text-muted">{Math.max(1, Math.round(f.size / 1024))} KB</span>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setFiles(files.filter((_, j) => j !== i))}>Remove</button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        {!enabled && <Notice tone="warn">The summarizer needs a Claude API key (ANTHROPIC_API_KEY) in the hosting settings. Until then, use “Add items by hand”.</Notice>}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn-primary" onClick={summarize} disabled={busy || preparing || !enabled}>
            {busy ? "Claude is reading the notes…" : draft ? "Summarize again" : "Summarize with Claude"}
          </button>
          {busy && <span className="text-xs text-muted">This usually takes 20–60 seconds.</span>}
        </div>
      </section>

      {draft && (
        <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <Notice tone="success"><strong>Draft ready.</strong> Check each part, untick anything you don't want, then save. Claude can misread names or dates, so a quick look is worth it.</Notice>

          <section className="card space-y-2 p-4">
            <h2 className="font-bold text-navy-900"><label htmlFor="ms-sum">Meeting summary</label></h2>
            <textarea id="ms-sum" rows={8} value={draft.summary} onChange={(e) => upd("summary", e.target.value)} className="w-full" maxLength={20000} />
          </section>

          {draft.people.length > 0 && (
            <section className="card space-y-3 p-4">
              <h2 className="font-bold text-navy-900">Updates by person ({draft.people.length})</h2>
              {draft.people.map((p, i) => (
                <div key={p.member_id + i}>
                  <label htmlFor={`ms-pp-${i}`}>{memberName(members.find((m) => m.id === p.member_id))}</label>
                  <textarea id={`ms-pp-${i}`} rows={2} value={p.update} maxLength={1500} className="mt-1 w-full"
                    onChange={(e) => upd("people", draft.people.map((x, j) => (j === i ? { ...x, update: e.target.value } : x)))} />
                </div>
              ))}
            </section>
          )}

          <section className="card">
            <div className="p-4"><h2 className="font-bold text-navy-900">New tasks ({draft.new_tasks.length})</h2><p className="text-xs text-muted">Added to the board. Edit any field before saving.</p></div>
            {draft.new_tasks.length === 0 && <p className="border-t border-line p-4 text-sm text-muted">No new tasks found in the notes.</p>}
            {draft.new_tasks.map((t, i) => {
              const set = (patch: Partial<typeof t>) => upd("new_tasks", draft.new_tasks.map((x, j) => (j === i ? { ...x, ...patch } : x)));
              return (
                <div key={i} className={`grid grid-cols-[auto_minmax(0,1fr)] gap-3 border-t border-line p-4 ${t.include ? "" : "opacity-50"}`}>
                  <input type="checkbox" checked={t.include} onChange={(e) => set({ include: e.target.checked })} aria-label="Add this task" className="mt-3" />
                  <div className="space-y-2">
                    <input value={t.title} onChange={(e) => set({ title: e.target.value })} maxLength={200} aria-label="Task title" className="w-full" />
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                      <select value={t.owner_id ?? ""} onChange={(e) => set({ owner_id: e.target.value || null })} aria-label="Owner">
                        <option value="">Unassigned</option>
                        {memberOpts.map((m) => <option key={m.id} value={m.id}>{memberName(m)}</option>)}
                      </select>
                      <select value={t.status} onChange={(e) => set({ status: e.target.value as typeof t.status })} aria-label="Status">
                        <option value="todo">To Do</option><option value="doing">Doing</option><option value="done">Done</option>
                      </select>
                      <select value={t.priority} onChange={(e) => set({ priority: e.target.value as typeof t.priority })} aria-label="Priority">
                        {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]} priority</option>)}
                      </select>
                      <input type="date" value={t.due_date ?? ""} onChange={(e) => set({ due_date: e.target.value || null })} aria-label="Due date" />
                      <select value={t.week} onChange={(e) => set({ week: e.target.value as typeof t.week })} aria-label="Add to">
                        <option value="this">Meeting week</option><option value="next">Following week</option><option value="backlog">Backlog</option>
                      </select>
                      <select value={t.project_id ?? ""} onChange={(e) => set({ project_id: e.target.value || null })} aria-label="Project">
                        <option value="">No project</option>
                        {projects.filter((p) => p.is_active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    {t.notes && <p className="text-xs text-muted">From the notes: {t.notes}</p>}
                  </div>
                </div>
              );
            })}
          </section>

          <section className="card">
            <div className="p-4"><h2 className="font-bold text-navy-900">Progress on existing tasks ({draft.task_updates.length})</h2><p className="text-xs text-muted">Status changes are applied to the task; the note is posted as a progress update on it.</p></div>
            {draft.task_updates.length === 0 && <p className="border-t border-line p-4 text-sm text-muted">No updates to tasks already on the board.</p>}
            {draft.task_updates.map((u, i) => {
              const set = (patch: Partial<typeof u>) => upd("task_updates", draft.task_updates.map((x, j) => (j === i ? { ...x, ...patch } : x)));
              return (
                <div key={u.task_id} className={`grid grid-cols-[auto_minmax(0,1fr)] gap-3 border-t border-line p-4 ${u.include ? "" : "opacity-50"}`}>
                  <input type="checkbox" checked={u.include} onChange={(e) => set({ include: e.target.checked })} aria-label="Apply this update" className="mt-1" />
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2"><a href={`/tasks/${u.task_id}`} target="_blank" className="font-semibold text-navy-900 hover:underline">{u.task_title}</a><StatusBadge status={u.current_status} /></div>
                    <select value={u.status} onChange={(e) => set({ status: e.target.value as typeof u.status })} aria-label="New status">
                      <option value="">Keep current status</option>
                      {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                    <textarea rows={2} value={u.note} maxLength={1500} onChange={(e) => set({ note: e.target.value })} aria-label="Progress note" className="w-full" />
                  </div>
                </div>
              );
            })}
          </section>

          <div className="sticky bottom-[calc(76px+env(safe-area-inset-bottom))] z-10 flex flex-wrap gap-2 rounded-xl border border-line bg-white/95 p-3 shadow-sm backdrop-blur lg:bottom-4">
            <button type="submit" className="btn-primary flex-1 sm:flex-none" disabled={saving}>{saving ? "Saving…" : "Save meeting & update the board"}</button>
            <button type="button" className="btn-ghost" onClick={() => setDraft(null)} disabled={saving}>Discard draft</button>
          </div>
        </form>
      )}
    </div>
  );
}
