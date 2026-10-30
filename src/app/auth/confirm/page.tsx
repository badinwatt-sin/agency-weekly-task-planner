import { AuthCard } from "@/components/AuthCard";
import { Notice } from "@/components/ui";
import { confirmEmailLink } from "./actions";

export const metadata = { title: "Continue" };

/**
 * Landing page for invitation and password-reset emails. The one-time token is
 * only redeemed when the person presses the button (a POST), so email security
 * scanners that pre-open links cannot use it up.
 */
export default async function ConfirmPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const type = sp.type === "invite" || sp.type === "recovery" ? sp.type : null;
  const tokenHash = sp.token_hash && /^[A-Za-z0-9_\-.]{10,200}$/.test(sp.token_hash) ? sp.token_hash : null;

  if (!type || !tokenHash) {
    return (
      <AuthCard title="This link isn't valid">
        <Notice tone="warn">The link is incomplete or has already been used. Request a new one from the sign-in page, or ask the Manager to resend your invitation.</Notice>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={type === "invite" ? "Welcome to the planner" : "Reset your password"}
      subtitle={type === "invite" ? "Continue to choose the password you'll use with your employee ID." : "Continue to choose a new password."}
    >
      {sp.error && (
        <div className="mb-4">
          <Notice tone="error">This link has expired or was already used. Please request a new one.</Notice>
        </div>
      )}
      <form action={confirmEmailLink} className="space-y-4">
        <input type="hidden" name="token_hash" value={tokenHash} />
        <input type="hidden" name="type" value={type} />
        <button className="btn-primary w-full">Continue</button>
      </form>
    </AuthCard>
  );
}
