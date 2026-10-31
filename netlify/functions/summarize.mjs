// Netlify Function (plain Node, no dependencies, no build step).
// Netlify stops synchronous functions after 60 s, so the work is split into short calls:
//   mode "read"      – transcribe ONE photo / PDF into text      (~5-20 s)
//   mode "summarize" – turn the combined text into the summary   (~15-40 s)
// Nothing is stored on the server.
import crypto from "node:crypto";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const API_VERSION = "2026-10-21";
const CALL_TIMEOUT_MS = 52_000; // stay under Netlify's 60 s wall

export const config = { path: "/api/summarize", method: "POST" };

// Best-effort brute-force guard (per warm instance; use a long password)
const fails = new Map();
const tooManyFails = (ip) => {
  const f = fails.get(ip);
  return f && f.n >= 8 && Date.now() - f.t < 15 * 60 * 1000;
};
const noteFail = (ip) => {
  const f = fails.get(ip);
  fails.set(ip, f && Date.now() - f.t < 15 * 60 * 1000 ? { n: f.n + 1, t: f.t } : { n: 1, t: Date.now() });
};
const samePassword = (a, b) =>
  crypto.timingSafeEqual(crypto.createHash("sha256").update(String(a)).digest(), crypto.createHash("sha256").update(String(b)).digest());

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
const str = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const oneOf = (v, list, d) => (list.includes(v) ? v : d);

const READ_PROMPT = `Transcribe everything written in this file so it can be used as meeting notes.
- Keep the original language (Thai stays Thai). Keep names, dates, deadlines, numbers and who-is-doing-what exactly as written.
- For chat screenshots keep "sender: message" lines in order. For tables keep one row per line. For handwriting or whiteboards, read as carefully as you can and write [unclear] where you cannot.
- Do not summarize, translate or add anything. Output only the transcription.`;

function summaryPrompt({ meetingDate, title, text }) {
  const d = new Date(`${meetingDate}T00:00:00Z`);
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return `You turn raw notes from a weekly team meeting into a clear summary of who does what and by when.

Meeting date: ${meetingDate} (${days[d.getUTCDay()]}). Resolve relative dates ("Friday", "next Tuesday", "ศุกร์นี้", "สัปดาห์หน้า", "พรุ่งนี้") from this date. Weeks run Monday to Sunday.
Meeting title: ${title || "(none)"}

Rules:
- Use ONLY what the notes say. Never invent people, tasks or dates. If a date is not stated or cannot be worked out, use null.
- Keep each person's name exactly as written in the notes (nickname or full name). Merge the same person written two ways.
- One task = one concrete action. Short, starts with a verb, same language as the notes (Thai notes → Thai).
- status: "new" (agreed in this meeting), "doing" (already in progress), "done" (finished), "blocked" (stuck or waiting on someone), "unclear" (owner or action is vague).
- priority: "high" only if urgency is stated or implied by a near deadline; otherwise "medium"; "low" if described as optional/later.
- "attention" lists what the manager should follow up: blockers, missing owners or dates, dependencies between people, risks. Max 6, each one short and specific.
- "highlights": the 3-5 most important things from the meeting, one short line each.
- "decisions": decisions that were made, if any (can be empty).
- Write all text fields in the language of the notes. Dates are always YYYY-MM-DD.

Reply with ONE JSON object and nothing else, in exactly this shape:
{
  "title": "short headline for this meeting, max 8 words",
  "headline": "one sentence that sums up the week",
  "highlights": ["..."],
  "people": [
    { "name": "...", "note": "one short line about this person's week, or empty string",
      "tasks": [ { "task": "...", "due": "YYYY-MM-DD or null", "due_text": "wording used in the notes, or null", "status": "new|doing|done|blocked|unclear", "priority": "high|medium|low" } ] }
  ],
  "attention": [ { "kind": "blocker|missing|dependency|risk", "text": "..." } ],
  "decisions": ["..."]
}

Notes from the meeting:
"""
${text}
"""`;
}

export function extractJson(text) {
  const t = String(text || "").trim();
  try {
    return JSON.parse(t);
  } catch {}
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]);
    } catch {}
  }
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
  throw new Error("no json");
}

// Never trust the model's shape: keep only what the screen can safely show.
export function clean(raw) {
  const o = raw && typeof raw === "object" ? raw : {};
  const list = (v, n, k) => (Array.isArray(v) ? v : []).map((x) => str(x, n)).filter(Boolean).slice(0, k);
  return {
    title: str(o.title, 100) || "สรุปประชุม",
    headline: str(o.headline, 300),
    highlights: list(o.highlights, 200, 6),
    people: (Array.isArray(o.people) ? o.people : [])
      .map((p) => ({
        name: str(p?.name, 80),
        note: str(p?.note, 200),
        tasks: (Array.isArray(p?.tasks) ? p.tasks : [])
          .map((t) => ({
            task: str(t?.task, 300),
            due: isDate(t?.due) ? t.due : null,
            due_text: str(t?.due_text, 60) || null,
            status: oneOf(t?.status, ["new", "doing", "done", "blocked", "unclear"], "new"),
            priority: oneOf(t?.priority, ["high", "medium", "low"], "medium"),
          }))
          .filter((t) => t.task)
          .slice(0, 30),
      }))
      .filter((p) => p.name && (p.tasks.length || p.note))
      .slice(0, 40),
    attention: (Array.isArray(o.attention) ? o.attention : [])
      .map((a) => ({ kind: oneOf(a?.kind, ["blocker", "missing", "dependency", "risk"], "risk"), text: str(a?.text, 250) }))
      .filter((a) => a.text)
      .slice(0, 8),
    decisions: list(o.decisions, 200, 6),
  };
}

async function claude(content, maxTokens) {
  let r;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": API_VERSION },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages: [{ role: "user", content }] }),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
  } catch (e) {
    const timeout = e && (e.name === "TimeoutError" || e.name === "AbortError");
    return { error: timeout ? "Claude ใช้เวลานานเกินไป ลองแบ่งการประชุมเป็นสองส่วน หรือลดจำนวนไฟล์" : "เชื่อมต่อ Claude ไม่ได้ ลองใหม่อีกครั้ง", status: 504 };
  }
  if (!r.ok) {
    const map = {
      401: "API key ของ Claude ไม่ถูกต้องหรือถูกยกเลิก",
      403: "API key นี้ไม่มีสิทธิ์ใช้งาน",
      429: "Claude ถูกเรียกถี่เกินไปหรือเครดิตหมด รอสักครู่แล้วลองใหม่",
      413: "ไฟล์ใหญ่เกินไป",
      400: "Claude อ่านไฟล์นี้ไม่ได้ ลองใช้รูปหรือข้อความแทน",
    };
    return { error: map[r.status] || `Claude ตอบกลับผิดพลาด (${r.status})`, status: 502 };
  }
  const data = await r.json().catch(() => null);
  return {
    text: (data?.content || []).filter((b) => b.type === "text").map((b) => b.text).join(""),
    truncated: data?.stop_reason === "max_tokens",
  };
}

export default async function handler(req) {
  const expected = process.env.APP_PASSWORD;
  if (!expected || expected.length < 6) return json(503, { code: "no_password", error: "ยังไม่ได้ตั้ง APP_PASSWORD (อย่างน้อย 6 ตัวอักษร) ใน Netlify" });

  const ip = (req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
  if (tooManyFails(ip)) return json(429, { code: "locked", error: "ใส่รหัสผิดหลายครั้ง รอ 15 นาทีแล้วลองใหม่" });
  if (!samePassword(req.headers.get("x-app-password") || "", expected)) {
    noteFail(ip);
    return json(401, { code: "bad_password", error: "รหัสผ่านไม่ถูกต้อง" });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return json(400, { error: "ข้อมูลที่ส่งมาไม่ถูกต้อง" });
  if (body.check) return json(200, { ok: true });
  if (!process.env.ANTHROPIC_API_KEY) return json(503, { code: "no_key", error: "ยังไม่ได้ตั้ง ANTHROPIC_API_KEY ใน Netlify" });

  if (body.mode === "read") {
    const img = body.image;
    const pdf = body.pdf;
    let block;
    if (img && ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(img.media_type) && typeof img.data === "string")
      block = { type: "image", source: { type: "base64", media_type: img.media_type, data: img.data } };
    else if (pdf && typeof pdf.data === "string") block = { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf.data } };
    else return json(400, { error: "ไม่พบไฟล์ที่จะอ่าน" });
    const r = await claude([block, { type: "text", text: READ_PROMPT }], 3500);
    if (r.error) return json(r.status, { error: r.error });
    return json(200, { ok: true, text: r.text.trim() });
  }

  const meetingDate = isDate(body.meetingDate) ? body.meetingDate : new Date().toISOString().slice(0, 10);
  const text = str(body.text, 150000);
  if (!text) return json(400, { error: "ใส่ข้อความหรือแนบไฟล์ก่อน" });
  const r = await claude([{ type: "text", text: summaryPrompt({ meetingDate, title: str(body.title, 120), text }) }], 4500);
  if (r.error) return json(r.status, { error: r.error });
  if (r.truncated) return json(502, { error: "สรุปยาวเกินไป ลองแบ่งการประชุมเป็นสองส่วน" });
  let parsed;
  try {
    parsed = extractJson(r.text);
  } catch {
    return json(502, { error: "อ่านคำตอบของ Claude ไม่ออก กดสรุปอีกครั้ง" });
  }
  return json(200, { ok: true, summary: clean(parsed), meetingDate });
}
