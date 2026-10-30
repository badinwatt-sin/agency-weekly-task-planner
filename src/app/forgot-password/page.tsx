import { AuthCard } from "@/components/AuthCard";
import { ForgotForm } from "./ForgotForm";

export const metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard title="Reset your password" subtitle="Enter your employee ID. We'll email a reset link to the work email the Manager registered for you.">
      <ForgotForm />
    </AuthCard>
  );
}
