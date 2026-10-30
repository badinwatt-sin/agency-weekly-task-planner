"use client";

import { createContext, useActionState, useContext, useRef, useTransition, type ReactNode } from "react";
import type { ActionResult } from "@/lib/types";

type Action = (prev: ActionResult<null> | null, fd: FormData) => Promise<ActionResult<null>>;

const PendingContext = createContext(false);

/**
 * Runs a server action and shows its success / error message. Submits via
 * onSubmit (not the `action` prop) so React does not clear what the person
 * typed when the server reports a problem.
 */
export function ActionForm({
  action,
  children,
  className = "",
  resetOnSuccess = false,
  confirmText,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  confirmText?: string;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, run, actionPending] = useActionState(async (prev: ActionResult<null> | null, fd: FormData) => {
    const result = await action(prev, fd);
    if (result.ok && resetOnSuccess) ref.current?.reset();
    return result;
  }, null);
  const [transitionPending, startTransition] = useTransition();
  const pending = actionPending || transitionPending;

  return (
    <PendingContext.Provider value={pending}>
      <form
        ref={ref}
        className={className}
        onSubmit={(e) => {
          e.preventDefault();
          if (confirmText && !window.confirm(confirmText)) return;
          const fd = new FormData(e.currentTarget);
          startTransition(() => run(fd));
        }}
      >
        {children}
        {state && (
          <p role={state.ok ? "status" : "alert"} className={`mt-2 text-sm font-medium ${state.ok ? "text-emerald-700" : "text-red-700"}`}>
            {state.ok ? state.message : state.error}
            {!state.ok && state.fieldErrors && <span className="block text-xs font-normal">{Object.values(state.fieldErrors).join(" · ")}</span>}
          </p>
        )}
      </form>
    </PendingContext.Provider>
  );
}

export function SubmitButton({ children, className = "btn-primary", pendingText }: { children: ReactNode; className?: string; pendingText?: string }) {
  const pending = useContext(PendingContext);
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? (pendingText ?? "Saving…") : children}
    </button>
  );
}
