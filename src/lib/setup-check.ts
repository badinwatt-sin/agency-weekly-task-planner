import "server-only";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

/**
 * Lists configuration problems by variable NAME only (never values), so the
 * sign-in page can explain a half-finished deployment instead of crashing.
 */
export function setupProblems(): string[] {
  const problems: string[] = [];
  if (!SUPABASE_URL) problems.push("NEXT_PUBLIC_SUPABASE_URL is missing");
  else if (!/^https?:\/\/[^/\s]+$/.test(SUPABASE_URL))
    problems.push("NEXT_PUBLIC_SUPABASE_URL should be just the project address, e.g. https://abcd1234.supabase.co (no extra path)");
  if (!SUPABASE_ANON_KEY) problems.push("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing (the anon / publishable key)");
  else if (SUPABASE_ANON_KEY.length <= 20) problems.push("NEXT_PUBLIC_SUPABASE_ANON_KEY looks too short — copy the whole key");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) problems.push("SUPABASE_SERVICE_ROLE_KEY is missing (the service_role / secret key)");
  const throttle = process.env.AUTH_THROTTLE_SECRET ?? "";
  if (throttle.length < 32) problems.push("AUTH_THROTTLE_SECRET is missing or shorter than 32 characters");
  return problems;
}
