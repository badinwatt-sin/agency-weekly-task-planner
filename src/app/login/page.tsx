import { redirect } from "next/navigation";
import { AuthCard } from "@/components/AuthCard";
import { Notice } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { safeNext } from "@/lib/throttle";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
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
