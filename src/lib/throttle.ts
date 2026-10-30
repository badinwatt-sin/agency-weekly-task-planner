import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "./supabase/admin";

// Login: 5 failed attempts per employee ID or 30 per network address in 15 minutes.
// Reset emails: 3 requests per employee ID or 10 per network address per hour.
// Supabase Auth applies its own additional rate limits on top of these.
const RULES = {
  login: { windowMin: 15, perKey: 5, perIp: 30, failuresOnly: true },
  reset: { windowMin: 60, perKey: 3, perIp: 10, failuresOnly: false },
} as const;

type Kind = keyof typeof RULES;

function hash(value: string): string {
  const secret = process.env.AUTH_THROTTLE_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_THROTTLE_SECRET must be set (32+ characters)");
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function normaliseEmployeeId(raw: string): string {
  return raw.trim().toUpperCase();
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  // Set by the hosting platform's edge (e.g. Vercel). First entry is the client.
  const fwd = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || h.get("x-real-ip") || "unknown";
}

export async function checkThrottle(kind: Kind, identifier: string, ip: string): Promise<{ allowed: true } | { allowed: false; retryMinutes: number }> {
  const rule = RULES[kind];
  const since = new Date(Date.now() - rule.windowMin * 60_000).toISOString();
  const admin = createAdminClient();
  const keyHash = hash(`${kind}:${normaliseEmployeeId(identifier)}`);
  const ipHash = hash(`ip:${ip}`);

  const base = () => {
    let q = admin.from("auth_attempts").select("id", { count: "exact", head: true }).eq("kind", kind).gte("created_at", since);
    if (rule.failuresOnly) q = q.eq("success", false);
    return q;
  };
  const [{ count: byKey }, { count: byIp }] = await Promise.all([base().eq("key_hash", keyHash), base().eq("ip_hash", ipHash)]);
  if ((byKey ?? 0) >= rule.perKey || (byIp ?? 0) >= rule.perIp) {
    return { allowed: false, retryMinutes: rule.windowMin };
  }
  return { allowed: true };
}

export async function recordAttempt(kind: Kind, identifier: string, ip: string, success: boolean) {
  const admin = createAdminClient();
  await admin.from("auth_attempts").insert({
    kind,
    key_hash: hash(`${kind}:${normaliseEmployeeId(identifier)}`),
    ip_hash: hash(`ip:${ip}`),
    success,
  });
  // Housekeeping: keep only the last 7 days.
  if (Math.random() < 0.05) {
    await admin.from("auth_attempts").delete().lt("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString());
  }
}

/** Small random delay so responses don't reveal whether an employee ID exists. */
export function jitter(minMs = 250, maxMs = 600) {
  return new Promise((r) => setTimeout(r, minMs + Math.random() * (maxMs - minMs)));
}

/** Only allow redirects to paths inside this app. */
export function safeNext(value: unknown, fallback = "/board"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}
