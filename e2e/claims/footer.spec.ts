// e2e/claims/footer.spec.ts
// R-1, in the mode the product actually ships in.
//
// The existing smoke suite pins NEXT_PUBLIC_CLAIMS_MODE="false", so it exercises
// the companion product and has never touched the two screens Doug was looking
// at. This suite runs the claims-mode server (see playwright.config.ts) and
// covers the front door and the claim itself.
//
// The assertion that matters most is the negative one: the bar appears, and it
// offers an anonymous claimant NO tabs. Making the footer app-wide without that
// rule would have multiplied Emy's "stuck on Requests" finding instead of
// fixing it.

import { test, expect, type Page } from "@playwright/test";

const PRIMARY = { role: "navigation" as const, name: "Primary" };

function footer(page: Page) {
  return page.getByRole(PRIMARY.role, { name: PRIMARY.name });
}

/** Identify + contact on the landing page, which redirects into /claim. */
async function startAClaim(page: Page) {
  await page.goto("/");
  await page.getByLabel("First name").fill("Emy");
  await page.getByLabel("Last name", { exact: true }).fill("Tester");
  await page.getByLabel("Sales order number").fill("123");
  await page.getByLabel("Email").fill("emy@rapqa.com");
  await page.getByRole("button", { name: "Get started" }).click();
  await page.waitForURL("**/claim");
}

test.describe("R-1 — the footer reaches the claim journey", () => {
  test("the front door has a bar, and it offers no tab an anonymous visitor cannot reach", async ({
    page,
  }) => {
    await page.goto("/");

    const bar = footer(page);
    await expect(bar).toBeVisible();

    // The support affordance, from content/support.ts.
    await expect(bar.getByRole("link", { name: /1-855-513-5435/ })).toBeVisible();
    await expect(bar.getByRole("link", { name: "Email us" })).toBeVisible();

    // The reachability rule, end to end: every one of these would bounce a
    // signed-out visitor, so none of them is offered.
    await expect(bar.getByRole("link", { name: "Guarantee" })).toHaveCount(0);
    await expect(bar.getByRole("link", { name: "Requests" })).toHaveCount(0);
    await expect(bar.getByRole("link", { name: "Shop" })).toHaveCount(0);
  });

  test("the claim keeps the bar, on the screen that never had one", async ({ page }) => {
    await startAClaim(page);

    const bar = footer(page);
    await expect(bar).toBeVisible();
    await expect(bar.getByRole("link", { name: /1-855-513-5435/ })).toBeVisible();
    await expect(bar.getByRole("link", { name: "Guarantee" })).toHaveCount(0);

    // The bar is fixed chrome, so the reservation has to be measured, not
    // assumed. toBeVisible() only checks for a non-empty box: it would pass
    // just as happily with pb-28 reverted and the button hidden under the bar
    // (adversarial review, 2026-08-19). Compare the geometry instead.
    const cta = page.getByRole("button", { name: /Next — a few confirmations/ });
    await cta.scrollIntoViewIfNeeded();
    const ctaBox = await cta.boundingBox();
    const barBox = await bar.boundingBox();
    expect(ctaBox).not.toBeNull();
    expect(barBox).not.toBeNull();
    expect(ctaBox!.y + ctaBox!.height).toBeLessThanOrEqual(barBox!.y);
  });

  test("the bar survives the step the customer actually moves through", async ({ page }) => {
    await startAClaim(page);
    await page.getByLabel("Model number").fill("CM-QUEEN-01");
    await page.getByLabel("Date of purchase").fill("2026-06-01");
    await page.getByLabel("Date of delivery").fill("2026-06-05");
    await page.getByRole("button", { name: /Next — a few confirmations/ }).click();

    // Role, not text: the same sentence also appears in the "still needed" list.
    await expect(
      page.getByRole("checkbox", { name: /clean and sanitary/ })
    ).toBeVisible();
    await expect(footer(page)).toBeVisible();
  });

  test("the staff desk has no consumer bar", async ({ page }) => {
    await page.goto("/admin");
    await expect(footer(page)).toHaveCount(0);
  });

  test("the demo day-jumper stays off the staff desk", async ({ page }) => {
    // It rides in the root layout now, so it needs the same surface rule the
    // bar reads or it floats over the desk offset for a bar that is not there.
    await page.goto("/");
    await expect(page.getByText("Demo", { exact: false }).first()).toBeVisible();
    await page.goto("/admin");
    await expect(page.getByRole("button", { name: /Demo/i })).toHaveCount(0);
  });
});
