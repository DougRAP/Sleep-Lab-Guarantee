import type { ClaimStatus } from "../../lib/types";
import { statusLabel } from "../../lib/claim-status";

/**
 * The claim-status pill — one register for a request's state everywhere it
 * appears (the admin list and the consumer's own Requests list). Renders the
 * shared `statusLabel`, so consumer and staff never read a status differently.
 *
 * The markup and classes are exactly the span this replaced at both call
 * sites — pixel-identical, extracted so the pill can't drift between surfaces.
 */
export function StatusChip({ status }: { status: ClaimStatus }) {
  return (
    <span className="shrink-0 rounded-full border border-[var(--line)] bg-white/[0.03] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-dawn">
      {statusLabel(status)}
    </span>
  );
}
