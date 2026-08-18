// Ghost loading for the staff desk (B-18): header, title, search row, and a
// few request-row ghosts, pulsing quietly until the real list arrives.
export default function Loading() {
  return (
    <main className="relative mx-auto flex min-h-[100dvh] w-full max-w-5xl flex-col px-6 pb-12 pt-[calc(env(safe-area-inset-top)+1.25rem)]">
      <div className="flex items-center justify-between">
        <div className="h-5 w-28 animate-pulse rounded bg-white/[0.07]" />
        <div className="h-4 w-44 animate-pulse rounded bg-white/[0.05]" />
      </div>
      <div className="mt-8 space-y-2">
        <div className="h-8 w-64 animate-pulse rounded bg-white/[0.07]" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded bg-white/[0.05]" />
      </div>
      <div className="mt-6 h-12 animate-pulse rounded-xl border border-[var(--line)] bg-white/[0.04]" />
      <div className="mt-6 space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-[20px] border border-[var(--line)] bg-white/[0.04]"
          />
        ))}
      </div>
    </main>
  );
}
