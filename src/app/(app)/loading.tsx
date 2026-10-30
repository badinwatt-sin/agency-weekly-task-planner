export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-56 rounded bg-line" />
      <div className="h-16 rounded-xl bg-white" />
      <div className="grid gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-64 rounded-xl bg-white" />
        ))}
      </div>
    </div>
  );
}
