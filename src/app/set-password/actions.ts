"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { passwordProblem } from "@/lib/validation";
import type { FormState } from "../login/actions";

export async function setPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your link has expired. Please request a new password link." };

  // Look up the employee ID server-side so the password can't contain it.
  const admin = createAdminClient();
  const { data: member } = await admin.from("members").select("id, is_active").eq("user_id", user.id).maybeSingle();
  if (!member || !member.is_active) return { error: "This account is not active. Please contact the Manager." };
  const { data: priv } = await admin.from("member_private").select("employee_id").eq("member_id", member.id).maybeSingle();

  const problem = passwordProblem(password, confirm, priv?.employee_id ?? null);
  if (problem) return { error: problem };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: error.message.includes("weak") || error.message.includes("pwned") ? "That password appears in known data breaches. Please choose another." : "Could not save the password. Please try again." };
  }

  await admin.from("members").update({ account_status: "active" }).eq("id", member.id);
  // Sign out other sessions after a password change.
  await supabase.auth.signOut({ scope: "others" });
  redirect("/board?welcome=1");
}
