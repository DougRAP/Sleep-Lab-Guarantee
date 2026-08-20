// e2e/claims/dates.spec.ts
// R-3, against the mode the product ships in.
//
// The refusal half uses Emy's screenshot from 2026-08-19 keystroke for
// keystroke: purchase 08/04/2026, delivery 07/29/2026, delivered six days
// before it was bought, taken by the app with "That makes today night 21".
// Those literals are safe to hardcode because "purchase after delivery" is
// true on any date.
//
// Everything that depends on WHEN the test runs is computed from the clock.
// The first cut hardcoded a delivery of 2026-07-29 and then asserted the
// before-night-31 choice appears; that assertion had nine days to live, because
// on 2026-08-29 the same date turns into night 31 and the choice never renders.

import { test, expect, type Page } from "@playwright/test";
import { startAClaim } from "./support";

const NEXT = /a few confirmations/;
const BACK = /Back/;

/** A plain date N days from today, in the customer's own calendar. */
function daysFromToday(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function openDetails(page: Page) {
  await startAClaim(page);
  await page.getByLabel("Model number").fill("CM-QUEEN-01");
}

test.describe("R-3 — dates that cannot both be true", () => {
  test("Emy's pair is refused, and correcting it opens the way again", async ({
    page,
  }) => {
    await openDetails(page);

    await page.getByLabel("Date of purchase").fill("2026-08-04");
    await page.getByLabel("Date of delivery").fill("2026-07-29");

    await expect(page.getByText(/purchase date lands after the delivery date/i)).toBeVisible();
    // A correction and a night count must never share the screen: for this pair
    // the count is nonsense, and it is exactly what the customer was shown.
    await expect(page.getByText(/night -?\d+/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: NEXT })).toBeDisabled();
    // Never stranded: the way out of a screen you cannot satisfy stays open.
    await expect(page.getByRole("button", { name: BACK })).toBeEnabled();
    // The field the message names is the one marked for assistive tech.
    await expect(page.getByLabel("Date of purchase")).toHaveAttribute("aria-invalid", "true");

    // Put an ordinary pair in, computed so this test does not expire: a
    // delivery 45 nights ago sits inside the window, past the before-31 gate.
    await page.getByLabel("Date of delivery").fill(daysFromToday(-45));
    await page.getByLabel("Date of purchase").fill(daysFromToday(-52));

    await expect(page.getByText(/purchase date lands after/i)).toHaveCount(0);
    await expect(page.getByText(/night 45 of your 90/)).toBeVisible();
    await expect(page.getByRole("button", { name: NEXT })).toBeEnabled();
  });

  test("a delivery of tomorrow is refused — the browser knows the real today", async ({
    page,
  }) => {
    // The server carries a day of grace for timezones; the browser needs none,
    // because its clock IS the customer's. Without that split this pair passed,
    // and the screen announced "night -1" over the before-31 choice.
    await openDetails(page);

    await page.getByLabel("Date of purchase").fill(daysFromToday(-60));
    await page.getByLabel("Date of delivery").fill(daysFromToday(1));

    await expect(page.getByText(/delivery date is still ahead of us/i)).toBeVisible();
    await expect(page.getByText(/night -?\d+/)).toHaveCount(0);
    await expect(
      page.getByRole("checkbox", { name: /automatically on day 31/ })
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: NEXT })).toBeDisabled();
    await expect(page.getByLabel("Date of delivery")).toHaveAttribute("aria-invalid", "true");
  });

  test("a delivery today is fine — the clock is not an obstacle", async ({ page }) => {
    await openDetails(page);

    await page.getByLabel("Date of purchase").fill(daysFromToday(-40));
    await page.getByLabel("Date of delivery").fill(daysFromToday(0));

    await expect(page.getByText(/still ahead of us/i)).toHaveCount(0);
    await expect(page.getByText(/night 0\b/)).toBeVisible();
  });

  test("the pickers are bounded, and the bound lets go when the pair breaks", async ({
    page,
  }) => {
    await openDetails(page);
    const purchase = page.getByLabel("Date of purchase");
    const delivery = page.getByLabel("Date of delivery");
    const today = daysFromToday(0);

    // Delivery can never be picked past today.
    await expect(delivery).toHaveAttribute("max", today);

    // While the pair holds, purchase cannot be picked past the delivery.
    await delivery.fill(daysFromToday(-45));
    await expect(purchase).toHaveAttribute("max", daysFromToday(-45));

    // Once it breaks, the bound falls back to today: the message names the
    // purchase field, so a picker greyed out by the questioned delivery date
    // would trap the customer in the one field they were told to look at.
    await purchase.fill(daysFromToday(-10));
    await expect(page.getByText(/purchase date lands after/i)).toBeVisible();
    await expect(purchase).toHaveAttribute("max", today);
  });

  test("past the 90 nights still goes through — this is a typo guard", async ({
    page,
  }) => {
    await openDetails(page);

    await page.getByLabel("Date of purchase").fill(daysFromToday(-130));
    await page.getByLabel("Date of delivery").fill(daysFromToday(-120));

    await expect(page.getByText(/past the 90-night window/i)).toBeVisible();
    await expect(page.getByRole("button", { name: NEXT })).toBeEnabled();
  });
});
