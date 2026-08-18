"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { selectGuaranteeAction } from "../lib/actions/select-guarantee";

/** One purchase in the switcher: enough to label it, no PII beyond the order. */
export type SwitchablePurchase = {
  id: string;
  salesOrderNumber: string;
  productDescription?: string | null;
};

/**
 * B-28: switch between the purchases on a multi-purchase account. Shown in the
 * header only when there is more than one (Doug 2026-07-27, option (a): "a
 * selector to switch between them"). A native select (works on mobile).
 * Selecting persists the choice server-side and refreshes so every page
 * re-resolves to it. NOTE: how a customer ADDS a second purchase is a separate,
 * not-yet-specified flow (pending Doug) — deliberately not invented here.
 */
export function PurchaseSwitcher({
  purchases,
  activeId,
}: {
  purchases: SwitchablePurchase[];
  activeId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    if (value === activeId) return;
    startTransition(async () => {
      const res = await selectGuaranteeAction(value);
      if (res.ok) router.refresh();
    });
  }

  function label(p: SwitchablePurchase): string {
    const name = p.productDescription?.trim();
    return name ? `${name} · ${p.salesOrderNumber}` : `Order ${p.salesOrderNumber}`;
  }

  return (
    <label className="min-w-0">
      <span className="sr-only">Choose a purchase</span>
      <select
        aria-label="Choose a purchase"
        value={activeId}
        onChange={onChange}
        disabled={pending}
        className="max-w-[52vw] truncate rounded-lg border border-[var(--line)] bg-white/[0.04] px-2 py-1 font-mono text-[11px] tracking-[0.02em] text-mist outline-none focus-visible:border-dawn/70 disabled:opacity-60"
      >
        {purchases.map((p) => (
          <option key={p.id} value={p.id}>
            {label(p)}
          </option>
        ))}
      </select>
    </label>
  );
}
