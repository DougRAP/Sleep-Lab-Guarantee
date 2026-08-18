// Ghost loading for the fitting (B-18): the exchange flow resumes a draft on
// the server, which takes a few reads — pulse the shell instantly instead of
// freezing the tap that opened it.
export default function Loading() {
  return (
    <main className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 pb-28">
      <div className="-mx-6 border-b border-[var(--line)] px-6 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <div className="flex items-center justify-between">
          <div className="h-5 w-28 animate-pulse rounded bg-white/[0.07]" />
          <div className="h-4 w-36 animate-pulse rounded bg-white/[0.05]" />
        </div>
      </div>
      <div className="mt-8 h-4 w-24 animate-pulse rounded bg-white/[0.06]" />
      <div className="mt-2 h-8 w-2/3 animate-pulse rounded bg-white/[0.07]" />
      <div className="mt-6 space-y-4">
        <div className="h-24 animate-pulse rounded-2xl border border-[var(--line)] bg-white/[0.04]" />
        <div className="h-14 animate-pulse rounded-2xl border border-[var(--line)] bg-white/[0.04]" />
        <div className="h-14 animate-pulse rounded-2xl border border-[var(--line)] bg-white/[0.04]" />
        <div className="h-12 animate-pulse rounded-xl bg-white/[0.06]" />
      </div>
    </main>
  );
}
