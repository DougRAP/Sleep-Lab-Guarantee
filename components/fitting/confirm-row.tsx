"use client";

import { cn } from "../../lib/utils";

/**
 * An accessible tap-to-confirm statement. A real checkbox in the accessibility
 * tree (role + aria-checked + keyboard), styled on-brand like a wide Chip.
 *
 * Confirmed state is never signalled by color alone: the mark itself appears,
 * the border fills, and the label carries the state. Unconfirmed is simply
 * "still needed" — never an error, never red (DESIGN.md).
 */
export function ConfirmRow({
  checked,
  onToggle,
  children,
  disabled = false,
}: {
  checked: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dawn/60 focus-visible:ring-offset-2 focus-visible:ring-offset-night",
        checked
          ? "border-dawn/50 bg-dawn/[0.08] text-cloud"
          : "border-[var(--line)] bg-white/[0.03] text-cloud/90 hover:bg-white/[0.06]"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-[2px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px] border transition-colors",
          checked ? "border-dawn bg-dawn text-[#241a12]" : "border-[var(--line)]"
        )}
      >
        {checked && (
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        )}
      </span>
      <span className="text-[15px] leading-snug">{children}</span>
    </button>
  );
}
