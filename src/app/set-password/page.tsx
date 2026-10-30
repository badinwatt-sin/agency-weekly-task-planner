import Link from "next/link";
import { AuthCard } from "@/components/AuthCard";
import { Notice } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { SetPasswordForm } from "./SetPasswordForm";

export const metadata = { title: "Choose a password" };

export default async function SetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AuthCard title="Link expired">
        <Notice tone="warn">Open the newest link from your email, or request a new password reset.</Notice>
        <Link href="/forgot-password" className="btn-primary mt-4 w-full">
          Request a new link
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose your password" subtitle="You'll sign in with your employee ID and this password.">
      <SetPasswordForm />
    </AuthCard>
  );
}
