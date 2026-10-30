import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Icon } from "@/components/Icon";
import { Avatar, Notice, PageHeader, SampleBadge } from "@/components/ui";
import { requireManager } from "@/lib/auth";
import { getMembers } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { memberName, type Member } from "@/lib/types";
import {
  addMember, removeSampleData, sendPasswordLink, setMemberActive, setupAccount, updateCredentials, updateMember,
} from "./actions";

export const metadata = { title: "Team admin" };

const ACCOUNT_LABEL: Record<Member["account_status"], { text: string; cls: string }> = {
  no_account: { text: "No account yet", cls: "bg-slate-100 text-slate-700" },
  invited: { text: "Invitation sent", cls: "bg-amber-50 text-amber-800" },
  active: { text: "Active account", cls: "bg-emerald-50 text-emerald-800" },
};

export default async function TeamAdminPage() {
  const me = await requireManager();
  const members = await getMembers(true);

  // Only whether an ID exists and a masked email are shown — never the employee ID itself.
  const admin = createAdminClient();
  const { data: privRows } = await admin.from("member_private").select("member_id, email");
  const priv = new Map<string, string>(((privRows ?? []) as { member_id: string; email: string }[]).map((r) => [r.member_id, r.email]));
  const mask = (email: string) => {
    const [u, d] = email.split("@");
    return `${u.slice(0, 2)}${"•".repeat(Math.max(2, u.length - 2))}@${d}`;
  };

  const supabase = await createClient();
  const { count: sampleCount } = await supabase.from("tasks").select("id", { count: "exact", head: true }).eq("is_sample", true);

  const real = members.filter((m) => !m.is_sample);
  const pending = real.filter((m) => m.is_active && m.account_status === "no_account").length;

  return (
    <>
      <PageHeader
        title="Team admin"
        icon="settings"
        subtitle="Manage the roster, roles and sign-in accounts. Changes take effect immediately — no code changes needed."
        actions={
          <>
            <Link href="/admin/projects" className="btn-secondary">
              <Icon name="folder" /> Projects
            </Link>
            <a href="/api/export?format=csv" className="btn-secondary">
              <Icon name="download" /> Export CSV
            </a>
            <a href="/api/export?format=json" className="btn-secondary">
              <Icon name="download" /> Full backup (JSON)
            </a>
          </>
        }
      />

      {pending > 0 && (
        <div className="mb-5">
          <Notice tone="info">
            {pending} roster {pending === 1 ? "entry has" : "entries have"} no sign-in account yet. Use <strong>Set up account</strong> to enter their employee ID and work
            email — they'll receive an invitation to choose their own password.
          </Notice>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_340px]">
        <section className="space-y-3" aria-label="Roster">
          {members.map((m) => {
            const status = ACCOUNT_LABEL[m.account_status];
            const email = priv.get(m.id);
            return (
              <details key={m.id} className={`card group ${m.is_active ? "" : "opacity-70"}`}>
                <summary className="flex cursor-pointer list-none items-center gap-3 p-4">
                  <Avatar member={m} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-navy-900">{memberName(m)}</span>
                      {m.display_name && <span className="text-xs text-muted">{m.full_name}</span>}
                      {m.role === "manager" && <span className="rounded bg-navy-900 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-white uppercase">Manager</span>}
                      {m.is_sample && <SampleBadge />}
                      {!m.is_active && <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700 uppercase">Deactivated</span>}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs">
                      {!m.is_sample && <span className={`rounded-full px-2 py-0.5 font-medium ${status.cls}`}>{status.text}</span>}
                      {email && (
                        <span className="text-muted">
                          <Icon name="mail" size={12} className="inline" /> {mask(email)} · Employee ID on file
                        </span>
                      )}
                    </div>
                  </div>
                  <Icon name="right" size={16} className="text-muted transition group-open:rotate-90" />
                </summary>

                <div className="grid gap-5 border-t border-line p-4 md:grid-cols-2">
                  <ActionForm action={updateMember} className="space-y-3">
                    <h3 className="text-sm font-bold text-navy-900">Details & role</h3>
                    <input type="hidden" name="id" value={m.id} />
                    <div>
                      <label htmlFor={`fn-${m.id}`}>Full name</label>
                      <input id={`fn-${m.id}`} name="full_name" defaultValue={m.full_name} required maxLength={120} className="mt-1 w-full" />
                    </div>
                    <div>
                      <label htmlFor={`dn-${m.id}`}>Display name (optional)</label>
                      <input id={`dn-${m.id}`} name="display_name" defaultValue={m.display_name ?? ""} maxLength={60} className="mt-1 w-full" />
                    </div>
                    <div>
                      <label htmlFor={`rl-${m.id}`}>Role</label>
                      <select id={`rl-${m.id}`} name="role" defaultValue={m.role} className="mt-1 w-full">
                        <option value="member">Team member</option>
                        <option value="manager">Manager</option>
                      </select>
                    </div>
                    <SubmitButton className="btn-secondary btn-sm">Save details</SubmitButton>
                  </ActionForm>

                  <div className="space-y-4">
                    {!m.is_sample && m.is_active && m.account_status === "no_account" && (
                      <ActionForm action={setupAccount} className="space-y-3 rounded-lg bg-royal-50 p-3">
                        <h3 className="flex items-center gap-1.5 text-sm font-bold text-navy-900">
                          <Icon name="lock" size={14} /> Set up account
                        </h3>
                        <input type="hidden" name="member_id" value={m.id} />
                        <div>
                          <label htmlFor={`eid-${m.id}`}>Employee ID</label>
                          <input id={`eid-${m.id}`} name="employee_id" required maxLength={64} autoComplete="off" spellCheck={false} className="mt-1 w-full" />
                        </div>
                        <div>
                          <label htmlFor={`em-${m.id}`}>Work email (for invitation & resets)</label>
                          <input id={`em-${m.id}`} name="email" type="email" required maxLength={254} autoComplete="off" className="mt-1 w-full" />
                        </div>
                        <SubmitButton pendingText="Sending invitation…">Send invitation</SubmitButton>
                      </ActionForm>
                    )}

                    {m.account_status !== "no_account" && (
                      <>
                        <ActionForm action={sendPasswordLink}>
                          <input type="hidden" name="member_id" value={m.id} />
                          <SubmitButton className="btn-secondary btn-sm" pendingText="Sending…">
                            <Icon name="mail" size={14} /> Send password link
                          </SubmitButton>
                        </ActionForm>
                        <details>
                          <summary className="cursor-pointer text-xs font-semibold text-royal-700">Change employee ID or email</summary>
                          <ActionForm action={updateCredentials} className="mt-2 space-y-2" resetOnSuccess>
                            <input type="hidden" name="member_id" value={m.id} />
                            <input name="employee_id" placeholder="New employee ID (leave blank to keep)" maxLength={64} autoComplete="off" className="w-full" aria-label="New employee ID" />
                            <input name="email" type="email" placeholder="New work email (leave blank to keep)" maxLength={254} autoComplete="off" className="w-full" aria-label="New work email" />
                            <SubmitButton className="btn-secondary btn-sm">Update sign-in details</SubmitButton>
                          </ActionForm>
                        </details>
                      </>
                    )}

                    {m.id !== me.member.id && (
                      <ActionForm
                        action={setMemberActive}
                        confirmText={m.is_active ? `Deactivate ${memberName(m)}? They will no longer be able to sign in. Their tasks and history are kept.` : undefined}
                      >
                        <input type="hidden" name="id" value={m.id} />
                        <input type="hidden" name="active" value={m.is_active ? "false" : "true"} />
                        <SubmitButton className={m.is_active ? "btn-danger btn-sm" : "btn-secondary btn-sm"}>{m.is_active ? "Deactivate" : "Reactivate"}</SubmitButton>
                      </ActionForm>
                    )}
                  </div>
                </div>
              </details>
            );
          })}
        </section>

        <aside className="space-y-5">
          <div className="card p-4">
            <h2 className="mb-3 font-bold text-navy-900">Add a team member</h2>
            <ActionForm action={addMember} className="space-y-3" resetOnSuccess>
              <div>
                <label htmlFor="new-name">Full name</label>
                <input id="new-name" name="full_name" required maxLength={120} className="mt-1 w-full" />
              </div>
              <div>
                <label htmlFor="new-display">Display name (optional)</label>
                <input id="new-display" name="display_name" maxLength={60} className="mt-1 w-full" />
              </div>
              <div>
                <label htmlFor="new-role">Role</label>
                <select id="new-role" name="role" className="mt-1 w-full" defaultValue="member">
                  <option value="member">Team member</option>
                  <option value="manager">Manager</option>
                </select>
              </div>
              <SubmitButton>
                <Icon name="plus" size={16} /> Add to roster
              </SubmitButton>
            </ActionForm>
          </div>

          <div className="card p-4 text-sm">
            <h2 className="mb-2 flex items-center gap-2 font-bold text-navy-900">
              <Icon name="shield" size={16} /> How sign-in works
            </h2>
            <ul className="list-disc space-y-1.5 pl-5 text-muted">
              <li>Employee IDs are the sign-in name only, stored on the server and never displayed.</li>
              <li>Each person chooses their own password (12+ characters) from an emailed link. Nobody else ever sees it.</li>
              <li>Repeated failed sign-ins are temporarily blocked.</li>
              <li>Deactivating someone blocks sign-in immediately but keeps their task history.</li>
            </ul>
          </div>

          {(sampleCount ?? 0) > 0 && (
            <div className="card border-violet-200 p-4">
              <h2 className="mb-1 font-bold text-navy-900">Sample data</h2>
              <p className="mb-3 text-sm text-muted">
                {sampleCount} demonstration tasks are loaded (marked <SampleBadge />). Remove them before the team starts using the planner.
              </p>
              <ActionForm action={removeSampleData} className="space-y-2" confirmText="Permanently delete all sample data?">
                <input name="confirm" placeholder="Type REMOVE" aria-label="Type REMOVE to confirm" className="w-full" autoComplete="off" />
                <SubmitButton className="btn-danger btn-sm">Remove sample data</SubmitButton>
              </ActionForm>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
