// Shared password check for the functions (password lives only in the APP_PASSWORD env variable).
import crypto from "node:crypto";

const fails = new Map(); // best-effort brute-force guard, per warm instance
const WINDOW = 15 * 60 * 1000;

export const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const same = (a, b) =>
  crypto.timingSafeEqual(crypto.createHash("sha256").update(String(a)).digest(), crypto.createHash("sha256").update(String(b)).digest());

/** Returns a Response when the request must be refused, otherwise null. */
export function guard(req) {
  const expected = process.env.APP_PASSWORD;
  if (!expected || expected.length < 6) return json(503, { code: "no_password", error: "ยังไม่ได้ตั้ง APP_PASSWORD (อย่างน้อย 6 ตัวอักษร) ใน Netlify" });
  const ip = (req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
  const f = fails.get(ip);
  if (f && f.n >= 8 && Date.now() - f.t < WINDOW) return json(429, { code: "locked", error: "ใส่รหัสผิดหลายครั้ง รอ 15 นาทีแล้วลองใหม่" });
  if (!same(req.headers.get("x-app-password") || "", expected)) {
    fails.set(ip, f && Date.now() - f.t < WINDOW ? { n: f.n + 1, t: f.t } : { n: 1, t: Date.now() });
    return json(401, { code: "bad_password", error: "รหัสผ่านไม่ถูกต้อง" });
  }
  return null;
}
