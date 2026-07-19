"use client";

import { useState, useTransition } from "react";
import { DEMO_DAY_PRESETS } from "../../lib/demo";
import { clearPreviewDay, previewDay } from "../../lib/actions/demo";
import { cn } from "../../lib/utils";

/**
 * Demo day-jumper — a deliberately un-customer-facing control that sets the
 * *effective journey day* for this browser session so the whole app (Tonight,
 * Guarantee, the fitting gate) can be previewed at any point in the 90 nights.
 *
 * Kept visually quiet and on-token: mono label, hairline, mist — never the dawn
 * accent, never a primary affordance. It reads as instrumentation, not a feature.
 * Rendered only when NEXT_PUBLIC_DEMO_MODE is on (the server decides).
 */
export function DayJumper({
  day,
  aboveNav = false,
}: {
  /** The currently applied effective day, or null when following real time. */
  day: number | null;
  /** Lift above the persistent bottom nav on tabbed screens. */
  aboveNav?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const [pending, startTransition] = useTransition();

  function apply(value: string | number) {
    startTransition(async () => {
      await previewDay(value);
      setOpen(false);
      setCustom("");
    });
  }

  function reset() {
    startTransition(async () => {
      await clearPreviewDay();
      setOpen(false);
    });
  }

  return (
    <div
      className={cn(
        "fixed left-3 z-40",
        aboveNav
          ? "bottom-[calc(env(safe-area-inset-bottom)+4.75rem)]"
          : "bottom-[calc(env(safe-area-inset-bottom)+0.75rem)]"
      )}
    >
      {open && (
        <div className="mb-2 w-[248px] rounded-[14px] border border-[var(--line)] bg-surface2/80 p-3 backdrop-blur-xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-mist">
            Demo &middot; preview day
          </p>

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {DEMO_DAY_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                disabled={pending}
                onClick={() => apply(preset)}
                aria-pressed={day === preset}
                className={cn(
                  "rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors",
                  day === preset
                    ? "border-[var(--line)] bg-white/[0.10] text-cloud"
                    : "border-[var(--line)] bg-white/[0.03] text-mist hover:text-cloud"
                )}
              >
                {preset}
              </button>
            ))}
          </div>

          <form
            className="mt-2.5 flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (custom.trim()) apply(custom);
            }}
          >
            <input
              aria-label="Preview a specific journey day"
              inputMode="numeric"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Day…"
              className="h-8 w-full rounded-lg border border-[var(--line)] bg-white/[0.04] px-2.5 font-mono text-[11px] text-cloud outline-none placeholder:text-mist/60 focus-visible:border-[var(--line)] focus-visible:ring-1 focus-visible:ring-mist/40"
            />
            <button
              type="submit"
              disabled={pending || !custom.trim()}
              className="h-8 shrink-0 rounded-lg border border-[var(--line)] bg-white/[0.03] px-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-mist transition-colors hover:text-cloud disabled:opacity-40"
            >
              Set
            </button>
          </form>

          <button
            type="button"
            disabled={pending}
            onClick={reset}
            className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-mist/70 underline-offset-4 transition-colors hover:text-cloud hover:underline"
          >
            Follow real time
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Demo controls — preview a journey day"
        className="rounded-full border border-[var(--line)] bg-surface2/70 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-mist backdrop-blur-xl transition-colors hover:text-cloud"
      >
        Demo{day === null ? "" : ` · day ${day}`}
      </button>
    </div>
  );
}
