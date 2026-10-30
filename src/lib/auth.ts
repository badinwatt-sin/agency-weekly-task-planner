import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { publicEnvReady } from "./env";
import { createClient } from "./supabase/server";
import type { CurrentUser, Member } from "./types";

export const MEMBER_COLUMNS = "id, full_name, display_name, role, is_active, account_status, sort_order, is_sample";

/**
 * Resolve the signed-in person. `getUser()` re-validates the session with the
 * auth server (never trust cookie contents alone). Deactivated people and
 * accounts without a roster entry resolve to null.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  if (!publicEnvReady()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("members").select(MEMBER_COLUMNS).eq("user_id", user.id).maybeSingle();
  const member = data as Member | null;
  if (!member || !member.is_active) return null;
  return { userId: user.id, member, isManager: member.role === "manager" };
});

/** For pages: send signed-out or deactivated people to the login page. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    if (!publicEnvReady()) redirect("/login");
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    // Signed in but no active roster entry → clear the session.
    redirect(authUser ? "/auth/signout?reason=inactive" : "/login");
  }
  return user;
}

/** For Manager-only pages. Access is ALSO enforced by row-level security. */
export async function requireManager(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.isManager) redirect("/board?denied=1");
  return user;
}

export class AuthError extends Error {}

/** For server actions and route handlers: throw instead of redirecting. */
export async function actionUser(opts: { manager?: boolean } = {}): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Your session has ended. Please sign in again.");
  if (opts.manager && !user.isManager) throw new AuthError("Only the Manager can do this.");
  return user;
}
