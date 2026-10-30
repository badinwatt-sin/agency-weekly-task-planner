"use server";

import { redirect } from "next/navigation";
import { siteUrl } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { checkThrottle, clientIp, jitter, normaliseEmployeeId, recordAttempt, safeNext } from "@/lib/throttle";

export interface FormState {
  error?: string;
  message?: string;
}

const GENERIC = "Employee ID or password is incorrect.";

/** Find the login email for an employee ID. Server-only; the ID never leaves the server. */
async function lookupAccount(employeeId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("member_private")
    .select("email, members!inner(is_active, user_id)")
    .eq("employee_id_normalized", normaliseEmployeeId(employeeId))
    .maybeSingle();
  const row = data as { email: string; members: { is_active: boolean; user_id: string | null } } | null;
  if (!row || !row.members.is_active || !row.members.user_id) return null;
  return { email: row.email };
}

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const employeeId = String(formData.get("employeeId") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!employeeId || !password || employeeId.length > 64 || password.length > 128) return { error: GENERIC };

  const ip = await clientIp();
  const gate = await checkThrottle("login", employeeId, ip);
  if (!gate.allowed) {
    return { error: `Too many sign-in attempts. For your security, please wait ${gate.retryMinutes} minutes or reset your password.` };
  }

  const account = await lookupAccount(employeeId);
  let ok = false;
  if (account) {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: account.email, password });
    ok = !error;
  } else {
    await jitter();
  }
  await recordAttempt("login", employeeId, ip, ok);
  if (!ok) return { error: GENERIC };

  redirect(safeNext(formData.get("next")));
}

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const employeeId = String(formData.get("employeeId") ?? "").trim();
  const done: FormState = {
    message: "If that employee ID has an account, a password reset link has been sent to the work email on file. The link expires after one hour.",
  };
  if (!employeeId || employeeId.length > 64) return done;

  const ip = await clientIp();
  const gate = await checkThrottle("reset", employeeId, ip);
  if (!gate.allowed) return { error: "Too many reset requests. Please try again later or ask the Manager for help." };
  await recordAttempt("reset", employeeId, ip, true);

  const account = await lookupAccount(employeeId);
  if (account) {
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(account.email, { redirectTo: `${siteUrl()}/set-password` });
  } else {
    await jitter();
  }
  return done;
}
