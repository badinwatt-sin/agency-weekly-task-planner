"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function confirmEmailLink(formData: FormData) {
  const tokenHash = String(formData.get("token_hash") ?? "");
  const type = formData.get("type") === "invite" ? "invite" : "recovery";
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    redirect(`/auth/confirm?type=${type}&token_hash=${encodeURIComponent(tokenHash)}&error=1`);
  }
  redirect("/set-password");
}
