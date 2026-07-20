// lib/claim-status.ts
// The shared status vocabulary — pure, no I/O, no imports from app/.
//
// Consumer and staff must never describe a status differently to each other, so
// `statusLabel` lives here and BOTH /requests and /admin read it. `statusNextStep`
// is the calm one-line answer to "what happens now?" — the guide's register, not
// a support queue: no ticket language, no "we will process your request".

import type { ClaimStatus } from "./types";

/** The status machine in plain language — no ticket-speak. */
export function statusLabel(status: ClaimStatus): string {
  const labels: Record<ClaimStatus, string> = {
    draft: "In progress",
    submitted: "Submitted",
    in_review: "In review",
    approved: "Approved",
    dealer_scheduled: "Scheduled",
    completed: "Completed",
    denied: "Declined",
    expired: "Expired",
    withdrawn: "Withdrawn",
  };
  return labels[status] ?? status;
}

/** The calm one-line answer to "what happens now?", per status. */
export function statusNextStep(status: ClaimStatus): string {
  const steps: Record<ClaimStatus, string> = {
    draft: "Pick up where you left off whenever you're ready.",
    submitted:
      "RAP has your request. You'll hear from your dealer about next steps.",
    in_review:
      "RAP is reading it over. There's nothing you need to do right now.",
    approved:
      "It's approved. Your dealer will be in touch to arrange the exchange.",
    dealer_scheduled:
      "Your dealer has it on the calendar. Both sleep partners should be there to choose the replacement.",
    completed: "This one's finished. Sleep well.",
    denied:
      "This one didn't meet the guarantee's terms. Your dealer can talk it through with you.",
    expired:
      "The 90-night window closed before this one was finished. Your dealer is still there for anything else.",
    withdrawn:
      "This request was withdrawn. Nothing about your guarantee has changed.",
  };
  return steps[status] ?? steps.submitted;
}
