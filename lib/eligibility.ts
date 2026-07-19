
// lib/eligibility.ts
import { Guarantee, Claim } from "./types";

export function calculateDaysSince(purchDate: string): number {
  const start = new Date(purchDate);
  const today = new Date();
  start.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const diffTime = today.getTime() - start.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

export function getEligibilityStatus(guarantee: Guarantee, existingClaims: Claim[] = []) {
  const days = calculateDaysSince(guarantee.purchDate);
  const hasPriorExchange = existingClaims.some(
    c => c.guaranteeId === guarantee.id && c.claimType === "comfort_exchange" && ["approved", "ra_issued", "completed"].includes(c.status)
  );

  let status: "too_early" | "eligible" | "expired" | "already_used" = "eligible";
  let message = "";
  let canProceed = true;

  if (hasPriorExchange) {
    status = "already_used";
    message = "This Comfort Guarantee has already been used for a one-time exchange.";
    canProceed = false;
  } else if (days < 30) {
    status = "too_early";
    message = `It typically takes 4–6 weeks for your body to fully adjust to a new mattress. Today is day ${days}. We recommend giving it until at least day 30 before requesting an exchange.`;
    canProceed = false;
  } else if (days > 90) {
    status = "expired";
    message = `The 90-night Comfort Guarantee window closed on day 90. Today is day ${days}. You can still file an OEM warranty claim or request other service.`;
    canProceed = false;
  } else {
    status = "eligible";
    message = `Great news — today is day ${days} of your 90-night period. You are eligible for a one-time comfort exchange.`;
    canProceed = true;
  }

  return { days, status, message, canProceed, hasPriorExchange };
}

export const RESTOCKING_FEE = 99;
export const FAST_INSPECTION_FEE = 29;

export const FRIENDLY_REMINDERS = [
  "This is a one-time exchange under the 90-Night Comfort Guarantee.",
  `A $${RESTOCKING_FEE} restocking fee applies.`,
  "The exchange is limited to in-stock mattress sets of equal or greater value (you pay any difference).",
  "Both sleep partners (if applicable) should be present at the store to select the replacement.",
  "The mattress must be in like-new, sanitary condition with original tags attached.",
  "No refunds are available under this Guarantee.",
];
