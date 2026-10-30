"use client";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Details are logged on the server; never show internal error messages to users.
  return (
    <div className="card mx-auto mt-10 max-w-md p-6 text-center">
      <h1 className="text-lg font-bold text-navy-900">Something went wrong</h1>
      <p className="mt-1 text-sm text-muted">Please try again. If it keeps happening, tell the Manager what you were doing.</p>
      <button onClick={reset} className="btn-primary mt-4">
        Try again
      </button>
    </div>
  );
}
