// Saves and loads the app's data (summaries + tasks) so every device sees the same thing.
// One JSON document in Netlify Blobs, protected by the same password. `rev` stops one
// device from silently overwriting another: a stale save is refused with the newer copy.
import { getStore } from "@netlify/blobs";
import { guard, json } from "../lib/auth.mjs";

export const config = { path: "/api/data" };

const KEY = "state-v2";
const MAX_BYTES = 4_500_000;

export default async function handler(req) {
  const refused = guard(req);
  if (refused) return refused;

  let store;
  try {
    store = getStore({ name: "meeting-data", consistency: "strong" });
  } catch {
    return json(503, { code: "no_storage", error: "ที่เก็บข้อมูลบน Netlify ยังไม่พร้อม" });
  }

  try {
    if (req.method === "GET") {
      const doc = await store.get(KEY, { type: "json" });
      return json(200, { ok: true, rev: doc?.rev ?? 0, state: doc?.state ?? null });
    }
    if (req.method === "PUT") {
      const text = await req.text();
      if (text.length > MAX_BYTES) return json(413, { error: "ข้อมูลใหญ่เกินไป" });
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        return json(400, { error: "ข้อมูลไม่ถูกต้อง" });
      }
      const s = body?.state;
      if (!s || typeof s !== "object" || !Array.isArray(s.entries) || typeof s.tasks !== "object" || Array.isArray(s.tasks))
        return json(400, { error: "รูปแบบข้อมูลไม่ถูกต้อง" });
      const current = await store.get(KEY, { type: "json" });
      const rev = current?.rev ?? 0;
      if (Number(body.baseRev) !== rev) return json(409, { code: "conflict", rev, state: current?.state ?? null });
      await store.setJSON(KEY, { rev: rev + 1, savedAt: Date.now(), state: s });
      return json(200, { ok: true, rev: rev + 1 });
    }
    return json(405, { error: "GET or PUT only" });
  } catch {
    return json(500, { error: "เข้าถึงที่เก็บข้อมูลไม่ได้ ลองใหม่อีกครั้ง" });
  }
}
