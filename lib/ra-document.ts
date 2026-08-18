// lib/ra-document.ts
// The Return Authorization document, extracted from the staff route so the
// consumer's copy (Doug 2026-07-23: "yes, view document") renders the exact
// same sheet. Pure render: authorization stays in the routes that call it.

import type { Claim, ClaimItem, Guarantee } from "./types";
import { COMFORT_EXCHANGE_FEE, WINDOW_OPEN_DAY, WINDOW_CLOSE_DAY } from "./eligibility";
import { GUARANTEE_META } from "../content/guarantee-terms";
import { formatPlainDate } from "./dates";

/**
 * The RA number is minted at submit as the claim's reference, but the
 * DOCUMENT only exists once RAP has authorized the exchange ("RAP authorizes
 * every exchange before the dealer completes it"). Before approval — and on a
 * denied/withdrawn request — there is nothing to print.
 */
export function raDocumentAvailable(status: Claim["status"]): boolean {
  return ["approved", "dealer_scheduled", "completed"].includes(status);
}

function esc(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface RaDocumentInput {
  claim: Claim;
  guarantee: Guarantee;
  items: ClaimItem[];
  dealerName: string | null;
}

/** The print-ready RA sheet. Callers must have authorized the read already. */
export function renderRaHtml({ claim, guarantee, items, dealerName }: RaDocumentInput): string {
  const customerName =
    [guarantee.customerFirstName, guarantee.customerLastName].filter(Boolean).join(" ") ||
    guarantee.customerLastName;
  const address =
    claim.atDeliveryAddress === false && claim.newAddress?.trim()
      ? claim.newAddress
      : "Original delivery address on file";
  const issued = claim.approvedAt ?? claim.updatedAt ?? claim.submittedAt ?? null;

  const itemRows = items.length
    ? items
        .map(
          (i) =>
            `<tr><td>${esc(i.modelNumber)}</td><td>${
              guarantee.productDescription ? esc(guarantee.productDescription) : "Mattress"
            }</td></tr>`
        )
        .join("")
    : `<tr><td colspan="2">See original sales order</td></tr>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Return Authorization ${esc(claim.raNumber)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Georgia, "Times New Roman", serif; color: #1e2230; background: #f6f5f2; }
  .sheet { max-width: 760px; margin: 0 auto; padding: 48px 40px 64px; background: #fff; min-height: 100vh; }
  header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #1e2230; padding-bottom: 14px; }
  .brand { font-size: 20px; letter-spacing: .02em; }
  .doc { font-family: "Courier New", monospace; font-size: 13px; text-transform: uppercase; letter-spacing: .12em; color: #5b6172; }
  h1 { font-size: 26px; margin: 28px 0 4px; }
  .ra-number { font-family: "Courier New", monospace; font-size: 18px; letter-spacing: .06em; }
  .muted { color: #5b6172; font-size: 13.5px; }
  section { margin-top: 26px; }
  h2 { font-family: "Courier New", monospace; font-size: 12px; text-transform: uppercase; letter-spacing: .14em; color: #5b6172; border-bottom: 1px solid #e5e2da; padding-bottom: 6px; margin: 0 0 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 14.5px; }
  td, th { text-align: left; padding: 6px 10px 6px 0; vertical-align: top; }
  .facts td:first-child { width: 200px; font-family: "Courier New", monospace; font-size: 12px; text-transform: uppercase; letter-spacing: .1em; color: #5b6172; padding-top: 8px; }
  .items th { font-family: "Courier New", monospace; font-size: 12px; text-transform: uppercase; letter-spacing: .1em; color: #5b6172; border-bottom: 1px solid #e5e2da; }
  .items td { border-bottom: 1px solid #f0efe9; padding: 8px 10px 8px 0; }
  ul { margin: 8px 0 0; padding-left: 20px; font-size: 14px; line-height: 1.6; }
  .sig { display: flex; gap: 40px; margin-top: 44px; }
  .sig div { flex: 1; border-top: 1px solid #1e2230; padding-top: 6px; font-size: 12.5px; color: #5b6172; }
  footer { margin-top: 40px; font-size: 12px; color: #5b6172; border-top: 1px solid #e5e2da; padding-top: 12px; }
  @media print { body { background: #fff; } .sheet { padding: 24px 8px; min-height: auto; } }
</style>
</head>
<body>
<div class="sheet">
  <header>
    <span class="brand">RAP &middot; ${esc(GUARANTEE_META.name)}</span>
    <span class="doc">Return Authorization</span>
  </header>

  <h1 class="ra-number">${esc(claim.raNumber)}</h1>
  <p class="muted">Issued ${issued ? esc(formatPlainDate(issued)) : "&mdash;"} &middot; Tracking ${esc(
    claim.trackingNumber ?? "—"
  )}${claim.exchangeSalesOrderNumber ? ` &middot; Exchange order ${esc(claim.exchangeSalesOrderNumber)}` : ""}</p>

  <section>
    <h2>Customer</h2>
    <table class="facts">
      <tr><td>Name</td><td>${esc(customerName)}</td></tr>
      <tr><td>Phone</td><td>${esc(claim.contactPhone ?? guarantee.customerPhone ?? "—")}</td></tr>
      <tr><td>Email</td><td>${esc(claim.contactEmail ?? guarantee.customerEmail ?? "—")}</td></tr>
      <tr><td>Mattress location</td><td>${esc(address)}</td></tr>
    </table>
  </section>

  <section>
    <h2>Original purchase</h2>
    <table class="facts">
      <tr><td>Sales order</td><td>${esc(guarantee.salesOrderNumber)}</td></tr>
      <tr><td>Guarantee number</td><td>${esc(guarantee.guaranteeNumber ?? "—")}</td></tr>
      <tr><td>Dealer</td><td>${esc(dealerName ?? guarantee.dealerName ?? "—")}</td></tr>
      <tr><td>Delivered</td><td>${esc(formatPlainDate(guarantee.deliveryDate))}</td></tr>
      ${
        guarantee.purchasePrice != null
          ? `<tr><td>Purchase price</td><td>$${esc(guarantee.purchasePrice.toFixed(2))}</td></tr>`
          : ""
      }
    </table>
  </section>

  <section>
    <h2>Authorized for exchange</h2>
    <table class="items">
      <tr><th>Model number</th><th>Description</th></tr>
      ${itemRows}
    </table>
  </section>

  <section>
    <h2>Conditions of the exchange</h2>
    <ul>
      <li>One-time comfort exchange under the ${esc(GUARANTEE_META.name)}, days ${WINDOW_OPEN_DAY}&ndash;${WINDOW_CLOSE_DAY}.</li>
      <li>A $${COMFORT_EXCHANGE_FEE} comfort exchange fee is collected by the dealer at the time of exchange (delivery and pickup within 50 miles included). California King sets carry a separate restocking fee.</li>
      <li>The replacement must be in stock and of equal or greater value; any price difference is paid at the dealer. No refunds or cash back.</li>
      <li>The mattress must be in like-new, sanitary condition with the law and model tags attached and legible.</li>
      <li>Both sleep partners should be present in-store to select the replacement.</li>
    </ul>
  </section>

  <div class="sig">
    <div>Customer signature &middot; date</div>
    <div>Dealer representative &middot; date</div>
  </div>

  <footer>
    This Return Authorization was issued by RAP under the ${esc(GUARANTEE_META.name)}.
    It authorizes the one-time comfort exchange described above and nothing further.
  </footer>
</div>
</body>
</html>`;
}
