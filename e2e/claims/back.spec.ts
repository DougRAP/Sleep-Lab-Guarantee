// e2e/claims/back.spec.ts
// R-2, against the mode the product ships in.
//
// The assertions that earn their keep are the first two, and they are written
// to measure the INSTANT rather than the eventual state.
//
// The first cut of R-2 passed a version of this file that used toHaveValue(),
// which auto-retries for five seconds. An adversarial review then throttled the
// connection and showed the field was genuinely EMPTY at the moment of the Back,
// and that anything typed in that window was destroyed when the refresh landed.
// The assertion had been measuring "the value arrives eventually". So: read the
// value once, with no polling, and prove it again with the round trips slowed.

import { test, expect, type Page } from "@playwright/test";

const MODEL = "CM-QUEEN-01";

function backControl(page: Page) {
  return page.getByRole("button", { name: /Back/ });
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

/** Fill the purchase details and move on to the qualification checkboxes. */
async function fillDetailsAndAdvance(page: Page) {
  await page.getByLabel("Model number").fill(MODEL);
  await page.getByLabel("Date of purchase").fill("2026-06-01");
  await page.getByLabel("Date of delivery").fill("2026-06-05");
  await page.getByRole("button", { name: /a few confirmations/ }).click();
  await expect(page.getByRole("checkbox", { name: /clean and sanitary/ })).toBeVisible();
}

test.describe("R-2 — Back through the claim", () => {
  test("going back keeps what the customer already typed", async ({ page }) => {
    await startAClaim(page);
    await fillDetailsAndAdvance(page);

    // Back exists here, which is what makes the absence assertions below mean
    // something: revert R-2 and this line fails.
    await expect(backControl(page)).toBeVisible();
    await backControl(page).click();

    // Poll only for the step to appear. The values are then read ONCE: by the
    // time the field is on screen it must already hold what was saved.
    const model = page.getByLabel("Model number");
    await expect(model).toBeVisible();
    expect(await model.inputValue()).toBe(MODEL);
    expect(await page.getByLabel("Date of delivery").inputValue()).toBe("2026-06-05");
  });

  test("and it is still correct when the connection is slow", async ({ page }) => {
    await startAClaim(page);
    await fillDetailsAndAdvance(page);

    // Every round trip to /claim now costs a second, which is what exposed the
    // first cut. Nothing on the Back path may depend on one.
    await page.route("**/claim", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.continue();
    });

    await backControl(page).click();
    const model = page.getByLabel("Model number");
    await expect(model).toBeVisible();
    expect(await model.inputValue()).toBe(MODEL);
  });

  test("the resume point moves with it, so a reload lands on the same step", async ({
    page,
  }) => {
    await startAClaim(page);
    await fillDetailsAndAdvance(page);
    await backControl(page).click();
    await expect(page.getByLabel("Model number")).toBeVisible();

    // Stepping back has to persist, or Back silently undoes itself. After a
    // reload the values come from the server, so polling is right here.
    await page.reload();
    await expect(page.getByLabel("Model number")).toHaveValue(MODEL);
    await expect(
      page.getByRole("button", { name: /a few confirmations/ })
    ).toBeVisible();
  });

  test("the first step offers no way back", async ({ page }) => {
    await startAClaim(page);
    // The entry form is a different page and the claim already exists.
    await expect(backControl(page)).toHaveCount(0);
  });

  test("no flow, no control: the front door has none", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    await expect(backControl(page)).toHaveCount(0);
  });

  test("once the claim number exists there is no going back", async ({ page }) => {
    await startAClaim(page);
    await fillDetailsAndAdvance(page);

    // Every qualification statement, plus the optional protector note.
    const boxes = page.getByRole("checkbox");
    for (let i = 0; i < (await boxes.count()); i++) await boxes.nth(i).click();
    await page.getByRole("button", { name: /photos, if you/ }).click();

    await page.getByRole("button", { name: /I can skip these/ }).click();
    await expect(backControl(page)).toBeVisible();

    await page.getByRole("button", { name: "Send my request" }).click();
    await expect(page.getByText(/^CG[A-Z0-9]{6}$/)).toBeVisible();
    await expect(backControl(page)).toHaveCount(0);
  });
});
