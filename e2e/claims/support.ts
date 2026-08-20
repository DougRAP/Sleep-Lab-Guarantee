// e2e/claims/support.ts
// Shared setup for the claims-mode suite. Not a spec: Playwright only collects
// *.spec.ts, so nothing here runs on its own.

import type { Page } from "@playwright/test";

/**
 * Anonymous claim creation is throttled to ten per IP every fifteen minutes
 * (lib/actions/claim.ts, guardEntryAttempt), and the link step carries a second
 * per-IP throttle (lib/actions/lookup-guard.ts). Both are real product
 * behaviour, covered by their own unit tests in lib/rate-limit.test.ts and
 * lib/lookup-guard.test.ts. The suite is not one person filing a dozen
 * requests: it is a dozen people filing one each, so each gets its own address
 * from the documentation range (RFC 5737), which is what the app would read in
 * production anyway.
 *
 * The address is drawn per call rather than counted, because the counter would
 * reset while the throttle does not: a retry runs in a fresh worker process,
 * and playwright.claims.config.ts deliberately reuses a warm dev server, so a
 * counted address collides with itself across runs inside the same fifteen
 * minutes. The failure would surface as an unrelated timeout waiting for
 * /claim, which is exactly the confusion this exists to avoid.
 *
 * Note setExtraHTTPHeaders REPLACES the context's header set. Nothing sets one
 * today; if a config ever adds use.extraHTTPHeaders, merge it here.
 */
let used = 0;
function nextClientIp(): string {
  used += 1;
  // Two documentation ranges, drawn at random, so neither a retry nor a warm
  // server can hand the same address out eleven times in one window.
  const range = used % 2 === 0 ? "198.51.100" : "203.0.113";
  return `${range}.${1 + Math.floor(Math.random() * 253)}`;
}

/** The identify + contact form on the landing page, through to /claim. */
export async function startAClaim(
  page: Page,
  overrides: Partial<{
    firstName: string;
    lastName: string;
    salesOrder: string;
    email: string;
  }> = {}
): Promise<void> {
  const it = {
    firstName: "Emy",
    lastName: "Tester",
    salesOrder: "123",
    email: "emy@rapqa.com",
    ...overrides,
  };

  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": nextClientIp() });
  await page.goto("/");
  await page.getByLabel("First name").fill(it.firstName);
  await page.getByLabel("Last name", { exact: true }).fill(it.lastName);
  await page.getByLabel("Sales order number").fill(it.salesOrder);
  await page.getByLabel("Email").fill(it.email);
  await page.getByRole("button", { name: "Get started" }).click();
  await page.waitForURL("**/claim");
}
