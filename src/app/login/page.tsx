import { redirect } from "next/navigation";
import { AuthCard } from "@/components/AuthCard";
import { Notice } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { setupProblems } from "@/lib/setup-check";
import { safeNext } from "@/lib/throttle";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const problems = setupProblems();
  if (problems.length) {
    return (
      <AuthCard title="Setup not finished" subtitle="The planner is deployed, but some settings are missing.">
        <Notice tone="warn">
          <ul className="list-disc space-y-1.5 pl-4">
            {problems.map((p) => (
              <li key={p} className="break-words">{p}</li>
            ))}
          </ul>
        </Notice>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          Add them in your hosting dashboard (Vercel: Settings → Environment Variables, tick Production), then <strong>redeploy</strong> — new values only apply after a redeploy.
        </p>
      </AuthCard>
    );
  }
  if (await getCurrentUser()) redirect(safeNext(sp.next));
  return (
    <AuthCard title="Sign in" subtitle="Use your employee ID and your personal password.">
      {sp.reason === "inactive" && (
        <div className="mb-4">
          <Notice tone="warn">Your account is not active. Please contact the Manager.</Notice>
        </div>
      )}
      {sp.reason === "password-set" && (
        <div className="mb-4">
          <Notice tone="success">Password saved. Please sign in.</Notice>
        </div>
      )}
      <LoginForm next={sp.next ? safeNext(sp.next) : undefined} />
      <p className="mt-5 text-xs leading-relaxed text-muted">
        New to the planner? The Manager sets up your account and you'll receive an email invitation to choose your password.
      </p>
    </AuthCard>
  );
}
