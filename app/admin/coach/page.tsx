import Link from "next/link";
import { redirect } from "next/navigation";
import { LivingSky } from "../../../components/living-sky";
import { Logo } from "../../../components/Logo";
import { SignOut } from "../../../components/auth/sign-out";
import { DemoViewBanner } from "../../../components/admin/demo-view-banner";
import { getRepository } from "../../../lib/data";
import { resolveStaffView } from "../../../lib/auth/staff-view";
import {
  HAIKU_PRICES_PER_MTOK,
  estimateCostUsd,
  formatUsd,
} from "../../../lib/coach-cost";
import type { ConciergeUsageDay } from "../../../lib/data/repository";

// Per-request: what this shows depends on who is looking.
export const dynamic = "force-dynamic";

export const metadata = { title: "Coach usage · RAP Sleep Lab" };

/** Days of raw daily lines to show; also covers any month-to-date window. */
const REPORT_DAYS = 62;

const n = (v: number) => v.toLocaleString("en-US");

/**
 * B-11: the coach cost report — RAP-only (a dealer has no business seeing
 * program AI spend). Reads the identifier-free daily aggregate; tokens are
 * exact, dollars are an estimate at Haiku list prices (the official number
 * lives in Doug's Anthropic Console).
 */
export default async function CoachUsagePage() {
  const resolved = await resolveStaffView();
  if (resolved.kind === "redirect") redirect(resolved.to);
  if (resolved.kind === "picker") redirect("/admin");
  const view = resolved.view;
  if (view.role !== "rap_admin") redirect("/admin");

  const days = await getRepository().listConciergeUsageDaily(REPORT_DAYS);

  // Month-to-date, on the same UTC calendar the daily view aggregates by.
  const monthPrefix = new Date().toISOString().slice(0, 7);
  const month = days.filter((d) => d.day.startsWith(monthPrefix));
  const sum = (rows: ConciergeUsageDay[]) =>
    rows.reduce(
      (t, d) => ({
        replies: t.replies + d.replies,
        apiCalls: t.apiCalls + d.apiCalls,
        inputTokens: t.inputTokens + d.inputTokens,
        outputTokens: t.outputTokens + d.outputTokens,
        cacheCreationTokens: t.cacheCreationTokens + d.cacheCreationTokens,
        cacheReadTokens: t.cacheReadTokens + d.cacheReadTokens,
      }),
      {
        replies: 0,
        apiCalls: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      }
    );
  const monthTotals = sum(month);
  const monthCost = estimateCostUsd(monthTotals);

  return (
    <>
      <LivingSky day={0} />
      <main
        id="main"
        className="relative mx-auto flex min-h-[100dvh] w-full max-w-5xl flex-col px-6 pb-12 pt-[calc(env(safe-area-inset-top)+1.25rem)]"
      >
        <div className="flex items-center justify-between gap-4">
          <Logo />
          <div className="flex min-w-0 items-center gap-4">
            {view.email && (
              <span
                title={view.email}
                className="min-w-0 truncate font-mono text-[11px] tracking-[0.02em] text-mist"
              >
                {view.email}
              </span>
            )}
            {!view.demo && <SignOut className="shrink-0" />}
          </div>
        </div>

        {view.demo && <DemoViewBanner label="RAP admin" />}

        <div className="mt-8 space-y-2">
          <Link
            href="/admin"
            className="text-[13px] text-mist underline-offset-4 hover:underline"
          >
            &larr; Exchange requests
          </Link>
          <h1 className="font-serif text-[26px] leading-[1.2] tracking-[-0.01em] text-cloud">
            Coach usage
          </h1>
          <p className="text-[13px] leading-relaxed text-mist">
            Token counts are exact, reported by the API with every reply.
            Dollars are an estimate at Claude Haiku list prices ($
            {HAIKU_PRICES_PER_MTOK.input}/M in, ${HAIKU_PRICES_PER_MTOK.output}
            /M out) — the official spend lives in the Anthropic Console.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-[11px] uppercase tracking-[0.14em] text-mist">
              Replies this month
            </p>
            <p className="mt-1 font-serif text-[24px] text-cloud">
              {n(monthTotals.replies)}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-[11px] uppercase tracking-[0.14em] text-mist">
              Tokens this month (in / out)
            </p>
            <p className="mt-1 font-serif text-[24px] text-cloud">
              {n(monthTotals.inputTokens)} / {n(monthTotals.outputTokens)}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-[11px] uppercase tracking-[0.14em] text-mist">
              Estimated cost this month
            </p>
            <p className="mt-1 font-serif text-[24px] text-cloud">
              {formatUsd(monthCost)}
            </p>
          </div>
        </div>

        <div className="mt-8">
          <h2 className="text-[13px] uppercase tracking-[0.14em] text-mist">
            By day (last {REPORT_DAYS} days)
          </h2>
          {days.length === 0 ? (
            <p className="mt-3 text-[14px] leading-relaxed text-mist">
              No coach conversations recorded yet. Usage starts counting from
              the first AI reply after this report shipped.
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-2xl border border-white/10">
              <table className="w-full min-w-[560px] text-left text-[13px]">
                <thead>
                  <tr className="border-b border-white/10 text-[11px] uppercase tracking-[0.12em] text-mist">
                    <th className="px-4 py-3 font-normal">Day</th>
                    <th className="px-4 py-3 font-normal">Replies</th>
                    <th className="px-4 py-3 font-normal">API calls</th>
                    <th className="px-4 py-3 font-normal">Tokens in</th>
                    <th className="px-4 py-3 font-normal">Tokens out</th>
                    <th className="px-4 py-3 font-normal">Est. cost</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((d) => (
                    <tr key={d.day} className="border-b border-white/5 text-cloud">
                      <td className="px-4 py-2.5 font-mono text-[12px]">{d.day}</td>
                      <td className="px-4 py-2.5">{n(d.replies)}</td>
                      <td className="px-4 py-2.5">{n(d.apiCalls)}</td>
                      <td className="px-4 py-2.5">{n(d.inputTokens)}</td>
                      <td className="px-4 py-2.5">{n(d.outputTokens)}</td>
                      <td className="px-4 py-2.5">{formatUsd(estimateCostUsd(d))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
