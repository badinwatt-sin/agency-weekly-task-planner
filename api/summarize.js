// Vercel serverless function (plain Node, no dependencies, no build step).
// Receives meeting notes (text, images, PDFs), asks Claude for a structured summary,
// and returns it. Nothing is stored on the server.
const crypto = require("crypto");

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const API_VERSION = "2026-10-21";
const MAX_BODY_CHARS = 4_300_000; // Vercel rejects request bodies over ~4.5 MB

// Best-effort brute-force guard (per warm instance; the password should be long anyway)
const fails = new Map();
function tooManyFails(ip) {
  const f = fails.get(ip);
  return f && f.n >= 8 && Date.now() - f.t < 15 * 60 * 1000;
}
function noteFail(ip) {
  const f = fails.get(ip);
  fails.set(ip, f && Date.now() - f.t < 15 * 60 * 1000 ? { n: f.n + 1, t: f.t } : { n: 1, t: Date.now() });
}
function samePassword(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function buildPrompt({ meetingDate, title, text, imageCount, docCount }) {
  const d = new Date(`${meetingDate}T00:00:00Z`);
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return `You turn raw notes from a weekly team meeting into a clear summary of who does what and by when.

Meeting date: ${meetingDate} (${days[d.getUTCDay()]}). Resolve relative dates ("Friday", "next Tuesday", "ศุกร์นี้", "สัปดาห์หน้า", "พรุ่งนี้") from this date. Weeks run Monday to Sunday.
Meeting title: ${title || "(none)"}
${imageCount ? `${imageCount} image(s) are attached (screenshots or photos of notes, chats, whiteboards). Read all text in them.\n` : ""}${docCount ? `${docCount} PDF document(s) are attached. Read them.\n` : ""}
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
${text || "(no typed notes — read the attached files)"}
"""`;
}

function extractJson(text) {
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

const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
const str = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const oneOf = (v, list, d) => (list.includes(v) ? v : d);

// Never trust the model's shape: keep only what the screen can safely show.
function clean(raw) {
  const o = raw && typeof raw === "object" ? raw : {};
  const people = (Array.isArray(o.people) ? o.people : [])
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
    .slice(0, 40);
  const list = (v, n, k) => (Array.isArray(v) ? v : []).map((x) => str(x, n)).filter(Boolean).slice(0, k);
  return {
    title: str(o.title, 100) || "สรุปประชุม",
    headline: str(o.headline, 300),
    highlights: list(o.highlights, 200, 6),
    people,
    attention: (Array.isArray(o.attention) ? o.attention : [])
      .map((a) => ({ kind: oneOf(a?.kind, ["blocker", "missing", "dependency", "risk"], "risk"), text: str(a?.text, 250) }))
      .filter((a) => a.text)
      .slice(0, 8),
    decisions: list(o.decisions, 200, 6),
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const send = (status, body) => res.status(status).json(body);
  if (req.method !== "POST") return send(405, { error: "POST only" });

  const expected = process.env.APP_PASSWORD;
  if (!expected || expected.length < 6)
    return send(503, { code: "no_password", error: "ยังไม่ได้ตั้ง APP_PASSWORD (อย่างน้อย 6 ตัวอักษร) ใน Vercel" });

  const ip = String(req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
  if (tooManyFails(ip)) return send(429, { code: "locked", error: "ใส่รหัสผิดหลายครั้ง รอ 15 นาทีแล้วลองใหม่" });
  if (!samePassword(req.headers["x-app-password"] || "", expected)) {
    noteFail(ip);
    return send(401, { code: "bad_password", error: "รหัสผ่านไม่ถูกต้อง" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = null;
    }
  }
  if (!body || typeof body !== "object") return send(400, { error: "ข้อมูลที่ส่งมาไม่ถูกต้อง" });
  if (body.check) return send(200, { ok: true });

  if (!process.env.ANTHROPIC_API_KEY)
    return send(503, { code: "no_key", error: "ยังไม่ได้ตั้ง ANTHROPIC_API_KEY ใน Vercel" });

  const meetingDate = isDate(body.meetingDate) ? body.meetingDate : new Date().toISOString().slice(0, 10);
  const text = str(body.text, 150000);
  const images = (Array.isArray(body.images) ? body.images : [])
    .filter((i) => ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(i?.media_type) && typeof i.data === "string")
    .slice(0, 8);
  const pdfs = (Array.isArray(body.pdfs) ? body.pdfs : []).filter((p) => typeof p?.data === "string").slice(0, 3);
  if (!text && !images.length && !pdfs.length) return send(400, { error: "ใส่ข้อความหรือแนบไฟล์ก่อน" });

  const content = [
    ...images.map((i) => ({ type: "image", source: { type: "base64", media_type: i.media_type, data: i.data } })),
    ...pdfs.map((p) => ({ type: "document", source: { type: "base64", media_type: "application/pdf", data: p.data } })),
    { type: "text", text: buildPrompt({ meetingDate, title: str(body.title, 120), text, imageCount: images.length, docCount: pdfs.length }) },
  ];

  let r;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": API_VERSION },
      body: JSON.stringify({ model: MODEL, max_tokens: 6000, messages: [{ role: "user", content }] }),
      signal: AbortSignal.timeout(250000),
    });
  } catch (e) {
    const timeout = e && (e.name === "TimeoutError" || e.name === "AbortError");
    return send(504, { error: timeout ? "Claude ใช้เวลานานเกินไป ลองแบ่งไฟล์เป็นสองรอบ" : "เชื่อมต่อ Claude ไม่ได้ ลองใหม่อีกครั้ง" });
  }

  if (!r.ok) {
    const map = {
      401: "API key ของ Claude ไม่ถูกต้องหรือถูกยกเลิก",
      403: "API key นี้ไม่มีสิทธิ์ใช้งาน",
      429: "Claude ถูกเรียกถี่เกินไปหรือเครดิตหมด รอสักครู่แล้วลองใหม่",
      413: "ไฟล์ใหญ่เกินไป ลดจำนวนหรือขนาดไฟล์",
      400: "Claude อ่านไฟล์ที่แนบไม่ได้ ลองใช้รูปหรือข้อความแทน",
    };
    return send(502, { error: map[r.status] || `Claude ตอบกลับผิดพลาด (${r.status})` });
  }

  const data = await r.json().catch(() => null);
  const reply = (data?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  if (data?.stop_reason === "max_tokens") return send(502, { error: "สรุปยาวเกินไป ลองแบ่งการประชุมเป็นสองส่วน" });
  let parsed;
  try {
    parsed = extractJson(reply);
  } catch {
    return send(502, { error: "อ่านคำตอบของ Claude ไม่ออก กดสรุปอีกครั้ง" });
  }
  return send(200, { ok: true, summary: clean(parsed), meetingDate });
};

module.exports._test = { clean, extractJson, buildPrompt };
