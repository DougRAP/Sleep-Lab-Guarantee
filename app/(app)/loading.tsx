// Ghost loading (B-18, review follow-up): an instant skeleton while the
// server assembles the page, so navigating never shows a frozen screen.
// Mirrors the consumer shell — sticky header, day eyebrow, title, cards —
// in quiet pulsing blocks. No data, no logic.
export default function Loading() {
  return (
    <main className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 pb-28">
      <div className="-mx-6 border-b border-[var(--line)] px-6 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <div className="flex items-center justify-between">
          <div className="h-5 w-28 animate-pulse rounded bg-white/[0.07]" />
          <div className="h-4 w-36 animate-pulse rounded bg-white/[0.05]" />
        </div>
      </div>
      <div className="mt-8 space-y-6">
        <div className="h-4 w-24 animate-pulse rounded bg-white/[0.06]" />
        <div className="h-8 w-3/4 animate-pulse rounded bg-white/[0.07]" />
        <div className="h-28 animate-pulse rounded-2xl border border-[var(--line)] bg-white/[0.04]" />
        <div className="h-12 animate-pulse rounded-xl bg-white/[0.06]" />
        <div className="h-40 animate-pulse rounded-2xl border border-[var(--line)] bg-white/[0.04]" />
      </div>
    </main>
  );
}
