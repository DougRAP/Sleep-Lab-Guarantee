// e2e/claims/words.spec.ts
// R-8, against the mode the product ships in.
//
// Emy's screenshot of a real claim:
//
//   IN YOUR WORDS
//   Nothing recorded here.
//
// Both detail views render the customer's own account and the v3 flow had no
// field feeding them, so the agent deciding the case got ticked boxes and not
// one line about what was actually wrong with the mattress.
//
// THE CEILING. An anonymous claimant cannot open /requests/[id] (it is gated on
// a linked guarantee or on claims.consumer_id), and this suite has no real
// auth, so nothing here can prove the words RENDER on the detail view. What it
// can prove is that they are present and optional, that they survive Back,
// which is R-2's invariant and the longest thing on that screen to lose, and
// that they never stand in the way of sending. That they are PERSISTED is
// covered in lib/claim-entry-action.test.ts, which drives the same action
// against a real repository.

import { test, expect } from "@playwright/test";
import { startAClaim } from "./support";

const SAID = "It's been firmer than I expected, and my shoulder wakes me.";
const WANTED = "Something softer through the shoulder, same size.";

/** A plain date N days from today, in the customer's own calendar. */
function daysFromToday(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

test.describe("R-8 — the customer's own words", () => {
  test("the two fields are there, optional, and never in the way", async ({
    page,
  }) => {
    await startAClaim(page);

    await expect(page.getByLabel("Your experience")).toBeVisible();
    await expect(page.getByLabel("What you'd rather have")).toBeVisible();

    // Leaving them empty must not close the way forward: they are optional.
    await page.getByLabel("Model number").fill("CM-QUEEN-01");
    await page.getByLabel("Date of delivery").fill(daysFromToday(-45));
    await page.getByLabel("Date of purchase").fill(daysFromToday(-52));
    await expect(page.getByRole("button", { name: /a few confirmations/ })).toBeEnabled();
  });

  test("they stay usable while a date is being corrected", async ({ page }) => {
    // R-3 closes the way forward for a pair that cannot both be true. That gate
    // must not reach these: a customer fixing a typo should not find the
    // sentence they were writing has become unusable.
    await startAClaim(page);
    await page.getByLabel("Model number").fill("CM-QUEEN-01");
    await page.getByLabel("Date of purchase").fill("2026-08-04");
    await page.getByLabel("Date of delivery").fill("2026-07-29");
    await expect(page.getByText(/purchase date lands after/i)).toBeVisible();

    await page.getByLabel("Your experience").fill(SAID);
    expect(await page.getByLabel("Your experience").inputValue()).toBe(SAID);
  });

  test("going back keeps what they wrote", async ({ page }) => {
    await startAClaim(page);
    await page.getByLabel("Model number").fill("CM-QUEEN-01");
    await page.getByLabel("Date of delivery").fill(daysFromToday(-45));
    await page.getByLabel("Date of purchase").fill(daysFromToday(-52));
    await page.getByLabel("Your experience").fill(SAID);
    await page.getByLabel("What you'd rather have").fill(WANTED);

    await page.getByRole("button", { name: /a few confirmations/ }).click();
    await expect(page.getByRole("checkbox", { name: /clean and sanitary/ })).toBeVisible();

    await page.getByRole("button", { name: /Back/ }).click();
    // Read once, with no polling: R-2's whole point is the INSTANT, and a
    // paragraph is the most expensive thing on this screen to lose.
    const said = page.getByLabel("Your experience");
    await expect(said).toBeVisible();
    expect(await said.inputValue()).toBe(SAID);
    expect(await page.getByLabel("What you'd rather have").inputValue()).toBe(WANTED);
  });

  test("filling them never stands in the way of sending", async ({ page }) => {
    // Named for what it actually proves. It cannot see the record, so it would
    // pass even if the action dropped both fields; that the words are
    // persisted is pinned in lib/claim-entry-action.test.ts, against the
    // action, with a repository behind it.
    await startAClaim(page);
    await page.getByLabel("Model number").fill("CM-QUEEN-01");
    await page.getByLabel("Date of delivery").fill(daysFromToday(-45));
    await page.getByLabel("Date of purchase").fill(daysFromToday(-52));
    await page.getByLabel("Your experience").fill(SAID);
    await page.getByRole("button", { name: /a few confirmations/ }).click();
    // Wait for the step to actually arrive: the save is a server action, and
    // counting the checkboxes before it lands counts zero of them.
    await expect(page.getByRole("checkbox", { name: /clean and sanitary/ })).toBeVisible();

    // The "Still needed" list shrinks with every tick, so the page reflows
    // under the cursor and a click can land on nothing. Tick only what is not
    // ticked, and go round again until the way forward opens.
    const boxes = page.getByRole("checkbox");
    const onward = page.getByRole("button", { name: /photos, if you/ });
    const total = await boxes.count();
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < total; i++) {
        const box = boxes.nth(i);
        if (!(await box.isChecked())) {
          await box.click();
          await page.waitForTimeout(120);
        }
      }
      if (await onward.isEnabled()) break;
    }
    await expect(onward).toBeEnabled();
    await onward.click();
    await page.getByRole("button", { name: /I can skip these/ }).click();
    await page.getByRole("button", { name: "Send my request" }).click();

    await expect(page.getByText(/^CG[A-Z0-9]{6}$/)).toBeVisible();
  });
});
