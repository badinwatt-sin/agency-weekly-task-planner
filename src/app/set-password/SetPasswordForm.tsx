"use client";

import { useActionState } from "react";
import { Notice } from "@/components/ui";
import type { FormState } from "../login/actions";
import { setPassword } from "./actions";

export function SetPasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(setPassword, {});
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="password">New password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={72} className="mt-1 w-full" />
        <p className="mt-1 text-xs text-muted">At least 12 characters. A short phrase of unrelated words works well. Don't use your employee ID.</p>
      </div>
      <div>
        <label htmlFor="confirm">Confirm password</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={12} maxLength={72} className="mt-1 w-full" />
      </div>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "Saving…" : "Save password"}
      </button>
    </form>
  );
}
