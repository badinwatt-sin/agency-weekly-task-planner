/**
 * One-time setup: give the Manager (Keng) a sign-in account.
 * Every other account is then created by the Manager inside the app.
 *
 *   npm run bootstrap:manager
 *
 * Prompts for the Manager's employee ID and work email, stores them
 * server-side and emails an invitation to choose a password. Nothing is
 * printed or written to disk. Requires .env.local (see .env.example).
 */
import { config } from "dotenv";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
if (!url || !key || !site) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SITE_URL in .env.local first.");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function main() {
  const { data: managers, error } = await admin.from("members").select("id, full_name, user_id").eq("role", "manager").eq("is_active", true).order("sort_order");
  if (error) throw error;
  if (!managers?.length) throw new Error("No active Manager on the roster. Run supabase/seed.sql first.");

  const rl = createInterface({ input, output });
  console.log("\nManagers on the roster:");
  (managers as { full_name: string; user_id: string | null }[]).forEach((m, i) => console.log(`  ${i + 1}. ${m.full_name}${m.user_id ? " (already has an account)" : ""}`));
  const pick = managers[Number((await rl.question(`Choose [1-${managers.length}]: `)) || "1") - 1];
  if (!pick) throw new Error("Invalid choice.");
  if (pick.user_id) throw new Error(`${pick.full_name} already has an account. Use "Forgot password" on the sign-in page.`);

  const employeeId = (await rl.question("Manager's employee ID: ")).trim();
  const email = (await rl.question("Manager's work email: ")).trim().toLowerCase();
  rl.close();
  if (!/^[A-Za-z0-9._\-/]{1,64}$/.test(employeeId)) throw new Error("Employee ID contains unsupported characters.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("That email doesn't look right.");

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${site}/set-password` });
  if (inviteError || !invited.user) throw new Error(`Invitation failed: ${inviteError?.message}`);

  const { error: privError } = await admin.from("member_private").upsert({ member_id: pick.id, employee_id: employeeId, email }, { onConflict: "member_id" });
  if (privError) {
    await admin.auth.admin.deleteUser(invited.user.id);
    throw new Error(`Could not store the employee ID: ${privError.message}`);
  }
  await admin.from("members").update({ user_id: invited.user.id, account_status: "invited" }).eq("id", pick.id);
  await admin.from("admin_audit").insert({ action: "manager_bootstrapped", target_id: pick.id });
  console.log(`\nDone. An invitation was emailed to ${pick.full_name}. Open it to choose a password, then sign in with the employee ID.\n`);
}

main().catch((e) => {
  console.error(`\n${e instanceof Error ? e.message : e}\n`);
  process.exit(1);
});
