"use server";

import { revalidatePath } from "next/cache";
import { actionUser, AuthError } from "@/lib/auth";
import { siteUrl } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { normaliseEmployeeId } from "@/lib/throttle";
import type { ActionResult, CurrentUser } from "@/lib/types";
import { accountSetupSchema, fieldErrors, memberInputSchema } from "@/lib/validation";

type Result = ActionResult<null>;
const ok = (message: string): Result => ({ ok: true, data: null, message });
const fail = (error: string, extra: Partial<Extract<Result, { ok: false }>> = {}): Result => ({ ok: false, error, ...extra });

async function manager(): Promise<CurrentUser> {
  return actionUser({ manager: true });
}

async function audit(actor: CurrentUser, action: string, targetId: string | null, details: Record<string, unknown> = {}) {
  await createAdminClient().from("admin_audit").insert({ actor_id: actor.member.id, action, target_id: targetId, details });
}

function handle(e: unknown): Result {
  if (e instanceof AuthError) return fail(e.message);
  console.error(e);
  return fail("Something went wrong. Please try again.");
}

async function activeManagerCount(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase.from("members").select("id", { count: "exact", head: true }).eq("role", "manager").eq("is_active", true);
  return count ?? 0;
}

export async function addMember(_prev: Result | null, fd: FormData): Promise<Result> {
  try {
    const me = await manager();
    const parsed = memberInputSchema.safeParse({
      full_name: fd.get("full_name"),
      display_name: (fd.get("display_name") as string)?.trim() || null,
      role: fd.get("role") ?? "member",
    });
    if (!parsed.success) return fail("Please check the form.", { fieldErrors: fieldErrors(parsed.error) });
    const supabase = await createClient();
    const { data, error } = await supabase.from("members").insert({ ...parsed.data, sort_order: 50 }).select("id").single();
    if (error) return fail("Could not add the person.");
    await audit(me, "member_added", data.id, { name: parsed.data.full_name, role: parsed.data.role });
    revalidatePath("/admin/team");
    return ok(`${parsed.data.full_name} added to the roster. Next: set up their account.`);
  } catch (e) {
    return handle(e);
  }
}

export async function updateMember(_prev: Result | null, fd: FormData): Promise<Result> {
  try {
    const me = await manager();
    const id = String(fd.get("id") ?? "");
    const parsed = memberInputSchema.safeParse({
      full_name: fd.get("full_name"),
      display_name: (fd.get("display_name") as string)?.trim() || null,
      role: fd.get("role"),
    });
    if (!parsed.success) return fail("Please check the form.", { fieldErrors: fieldErrors(parsed.error) });
    if (id === me.member.id && parsed.data.role !== "manager" && (await activeManagerCount()) <= 1) {
      return fail("You are the only Manager. Make someone else Manager first.");
    }
    const supabase = await createClient();
    const { error, count } = await supabase.from("members").update(parsed.data, { count: "exact" }).eq("id", id);
    if (error || !count) return fail("Could not save changes.");
    await audit(me, "member_updated", id, parsed.data);
    revalidatePath("/admin/team");
    return ok("Changes saved.");
  } catch (e) {
    return handle(e);
  }
}

export async function setMemberActive(_prev: Result | null, fd: FormData): Promise<Result> {
  try {
    const me = await manager();
    const id = String(fd.get("id") ?? "");
    const active = fd.get("active") === "true";
    if (id === me.member.id && !active) return fail("You can't deactivate your own account.");

    const admin = createAdminClient();
    const { data: target } = await admin.from("members").select("id, user_id, role, full_name").eq("id", id).maybeSingle();
    if (!target) return fail("Person not found.");

    const supabase = await createClient();
    const { error } = await supabase.from("members").update({ is_active: active }).eq("id", id);
    if (error) return fail("Could not update the account.");

    // Block (or unblock) sign-in at the authentication service too.
    if (target.user_id) {
      await admin.auth.admin.updateUserById(target.user_id, { ban_duration: active ? "none" : "876000h" });
    }
    await audit(me, active ? "member_reactivated" : "member_deactivated", id);
    revalidatePath("/admin/team");
    return ok(active ? `${target.full_name} reactivated.` : `${target.full_name} deactivated. They can no longer sign in; their tasks and history are kept.`);
  } catch (e) {
    return handle(e);
  }
}

/**
 * Attach an employee ID + work email to a roster entry and send the invitation.
 * Employee IDs are stored server-side only and never shown back in full.
 */
export async function setupAccount(_prev: Result | null, fd: FormData): Promise<Result> {
  try {
    const me = await manager();
    const parsed = accountSetupSchema.safeParse({ member_id: fd.get("member_id"), employee_id: fd.get("employee_id"), email: fd.get("email") });
    if (!parsed.success) return fail("Please check the form.", { fieldErrors: fieldErrors(parsed.error) });
    const { member_id, employee_id, email } = parsed.data;
    const admin = createAdminClient();

    const { data: member } = await admin.from("members").select("id, user_id, is_active, is_sample, full_name").eq("id", member_id).maybeSingle();
    if (!member || !member.is_active || member.is_sample) return fail("Choose an active roster entry.");
    if (member.user_id) return fail("This person already has an account. Use “Send password link” or update their details instead.");

    const { data: clash } = await admin.from("member_private").select("member_id").eq("employee_id_normalized", normaliseEmployeeId(employee_id)).maybeSingle();
    if (clash && clash.member_id !== member_id) return fail("That employee ID is already assigned to someone else.", { fieldErrors: { employee_id: "Already in use" } });

    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteUrl()}/set-password`,
      data: { roster_member_id: member_id },
    });
    if (inviteError || !invited.user) {
      return fail(inviteError?.message?.toLowerCase().includes("already") ? "An account already exists for that email." : "Could not send the invitation. Check the email address and email settings.");
    }

    const { error: privError } = await admin.from("member_private").upsert({ member_id, employee_id, email }, { onConflict: "member_id" });
    if (privError) {
      await admin.auth.admin.deleteUser(invited.user.id); // roll back
      return fail("Could not save the employee ID. Nothing was changed.");
    }
    await admin.from("members").update({ user_id: invited.user.id, account_status: "invited" }).eq("id", member_id);
    await audit(me, "account_invited", member_id);
    revalidatePath("/admin/team");
    return ok(`Invitation sent to ${member.full_name}. They choose their own password from the email link.`);
  } catch (e) {
    return handle(e);
  }
}

/** Replace a person's employee ID and/or login email. */
export async function updateCredentials(_prev: Result | null, fd: FormData): Promise<Result> {
  try {
    const me = await manager();
    const member_id = String(fd.get("member_id") ?? "");
    const newId = String(fd.get("employee_id") ?? "").trim();
    const newEmail = String(fd.get("email") ?? "").trim().toLowerCase();
    if (!newId && !newEmail) return fail("Enter a new employee ID or email.");

    const admin = createAdminClient();
    const { data: member } = await admin.from("members").select("id, user_id").eq("id", member_id).maybeSingle();
    const { data: priv } = await admin.from("member_private").select("employee_id, email").eq("member_id", member_id).maybeSingle();
    if (!member || !priv) return fail("Set up the account first.");

    const parsed = accountSetupSchema.safeParse({ member_id, employee_id: newId || priv.employee_id, email: newEmail || priv.email });
    if (!parsed.success) return fail("Please check the form.", { fieldErrors: fieldErrors(parsed.error) });

    if (newId) {
      const { data: clash } = await admin.from("member_private").select("member_id").eq("employee_id_normalized", normaliseEmployeeId(newId)).maybeSingle();
      if (clash && clash.member_id !== member_id) return fail("That employee ID is already assigned to someone else.");
    }
    if (newEmail && member.user_id) {
      const { error } = await admin.auth.admin.updateUserById(member.user_id, { email: parsed.data.email, email_confirm: true });
      if (error) return fail("Could not change the login email.");
    }
    const { error } = await admin.from("member_private").update({ employee_id: parsed.data.employee_id, email: parsed.data.email }).eq("member_id", member_id);
    if (error) return fail("Could not save the changes.");
    await audit(me, "credentials_updated", member_id, { employee_id_changed: !!newId, email_changed: !!newEmail });
    revalidatePath("/admin/team");
    return ok("Sign-in details updated.");
  } catch (e) {
    return handle(e);
  }
}

/** Email a fresh "choose your password" link (works for pending invitations and resets). */
export async function sendPasswordLink(_prev: Result | null, fd: FormData): Promise<Result> {
  try {
    const me = await manager();
    const member_id = String(fd.get("member_id") ?? "");
    const admin = createAdminClient();
    const { data: priv } = await admin.from("member_private").select("email").eq("member_id", member_id).maybeSingle();
    if (!priv) return fail("Set up the account first.");
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(priv.email, { redirectTo: `${siteUrl()}/set-password` });
    if (error) return fail("Could not send the email. Please wait a minute and try again.");
    await audit(me, "password_link_sent", member_id);
    return ok("Password link sent to their work email.");
  } catch (e) {
    return handle(e);
  }
}

/** Permanently delete every record marked as sample/demo data. */
export async function removeSampleData(_prev: Result | null, fd: FormData): Promise<Result> {
  try {
    const me = await manager();
    if (fd.get("confirm") !== "REMOVE") return fail("Type REMOVE to confirm.");
    const admin = createAdminClient();
    await admin.from("tasks").delete().eq("is_sample", true);
    await admin.from("meetings").delete().eq("is_sample", true);
    await admin.from("projects").delete().eq("is_sample", true);
    await admin.from("members").delete().eq("is_sample", true).is("user_id", null);
    await audit(me, "sample_data_removed", null);
    revalidatePath("/", "layout");
    return ok("All sample tasks, projects, meetings and placeholder people were removed.");
  } catch (e) {
    return handle(e);
  }
}
