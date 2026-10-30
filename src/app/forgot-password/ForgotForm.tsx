"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Notice } from "@/components/ui";
import { requestPasswordReset, type FormState } from "../login/actions";

export function ForgotForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(requestPasswordReset, {});
  if (state.message) {
    return (
      <div className="space-y-4">
        <Notice tone="success">{state.message}</Notice>
        <Link href="/login" className="btn-secondary w-full">
          Back to sign in
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="employeeId">Employee ID</label>
        <input id="employeeId" name="employeeId" autoComplete="username" required maxLength={64} className="mt-1 w-full" />
      </div>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </button>
      <Link href="/login" className="block text-center text-sm font-semibold text-royal-600 hover:underline">
        Back to sign in
      </Link>
    </form>
  );
}
