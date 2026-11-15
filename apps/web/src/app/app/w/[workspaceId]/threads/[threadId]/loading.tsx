const SKELETON_ROWS = [0, 1, 2, 3, 4, 5];

export default function Loading() {
  return (
    <div role="status" aria-busy="true" className="space-y-6">
      <span className="sr-only">Loading…</span>
      <div className="animate-pulse space-y-3">
        <div className="h-8 w-48 rounded bg-neutral-200" />
        <div className="h-4 w-80 max-w-full rounded bg-neutral-200" />
      </div>
      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white p-4">
        <div className="space-y-3">
          {SKELETON_ROWS.map((row) => (
            <div key={row} className="h-10 animate-pulse rounded bg-neutral-200" />
          ))}
        </div>
      </div>
    </div>
  );
}
