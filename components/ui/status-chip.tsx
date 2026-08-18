import type { ClaimStatus } from "../../lib/types";
import { statusLabel } from "../../lib/claim-status";

/**
 * The claim-status pill — one register for a request's state everywhere it
 * appears (the admin list and the consumer's own Requests list). Renders the
 * shared `statusLabel`, so consumer and staff never read a status differently.
 *
 * Contrast raised on Emmy's QA (2026-07-23: "can't see statuses unless
 * hovering"): a dawn-tinted fill, a stronger border and semibold type — the
 * same single register, just legible at a glance on every screen.
 */
export function StatusChip({ status }: { status: ClaimStatus }) {
  return (
    <span className="shrink-0 rounded-full border border-dawn/50 bg-dawn/15 px-3 py-1 font-mono text-[11.5px] font-semibold uppercase tracking-[0.08em] text-dawn">
      {statusLabel(status)}
    </span>
  );
}
