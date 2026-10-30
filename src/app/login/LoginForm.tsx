"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Icon } from "@/components/Icon";
import { login, type FormState } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(login, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <div>
        <label htmlFor="employeeId">Employee ID</label>
        <input
          id="employeeId"
          name="employeeId"
          autoComplete="username"
          autoCapitalize="characters"
          spellCheck={false}
          required
          maxLength={64}
          className="mt-1 w-full"
        />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="password">Password</label>
          <Link href="/forgot-password" className="text-xs font-semibold text-royal-600 hover:underline">
            Forgot password?
          </Link>
        </div>
        <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={128} className="mt-1 w-full" />
      </div>
      {state.error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          <Icon name="alert" size={16} className="mt-0.5" />
          {state.error}
        </p>
      )}
      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
