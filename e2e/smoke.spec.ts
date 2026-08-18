// e2e/smoke.spec.ts
// Smoke coverage for the 2026-07-22 review punch list, against the in-memory
// backend (see playwright.config.ts). One browser, serial, self-contained.

import { test, expect, type Page } from "@playwright/test";
import { DEMO_DAY_COOKIE } from "../lib/demo";

/** Light-verify entry with the seeded demo purchase (order 123 / demo). */
async function enterAsCustomer(page: Page) {
  await page.goto("/");
  await page.getByLabel("Sales order number").fill("123");
  await page.getByLabel("Last name", { exact: true }).fill("demo");
  await page.getByRole("button", { name: "Find my purchase" }).click();
  await page.waitForURL("**/tonight");
}

/** Jump the demo day the same way the day-jumper cookie does. */
async function setDemoDay(page: Page, day: number) {
  await page.context().addCookies([
    { name: DEMO_DAY_COOKIE, value: String(day), url: "http://localhost:3100" },
  ]);
}

test.describe("consumer shell (punch list A)", () => {
  test("entry lands on Tonight with the sticky footer nav everywhere", async ({ page }) => {
    await enterAsCustomer(page);
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();

    // The footer is the escape route — it must survive navigation.
    await page.getByRole("link", { name: "Guarantee" }).click();
    await page.waitForURL("**/guarantee");
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    // Day count now reads as an eyebrow, not in the header.
    await expect(page.getByText("DAY 0 / 90")).toBeVisible();
    // The quiet way out lives in the sticky header on every page.
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  });

  test("the coach is bypassable: /guarantee direct, no chat gate", async ({ page }) => {
    await enterAsCustomer(page);
    await page.goto("/guarantee");
    await expect(
      page.getByRole("heading", { name: "Your 90-Night Comfort Guarantee" })
    ).toBeVisible();
  });
});

test.describe("fee copy (punch list C)", () => {
  test("the guarantee cites the $199 comfort exchange fee, never $99", async ({ page }) => {
    await enterAsCustomer(page);
    await page.goto("/guarantee");
    await expect(page.getByText("$199 comfort exchange fee")).toBeVisible();
    await expect(page.getByText("$99 restocking fee")).toHaveCount(0);
  });
});

test.describe("requests CTA (punch list C)", () => {
  test("gated at day 0, live at day 31", async ({ page }) => {
    await enterAsCustomer(page);

    await page.goto("/requests");
    await expect(page.getByText("Opens on day 31")).toBeVisible();

    await setDemoDay(page, 31);
    await page.goto("/requests");
    await expect(page.getByRole("link", { name: "Start a new request" })).toBeVisible();
  });

  test("opening the fitting leaves no ghost draft; typing does (Emmy fix)", async ({ page }) => {
    await enterAsCustomer(page);
    await setDemoDay(page, 31);

    // Merely opening the fitting must create nothing.
    await page.goto("/fitting");
    await expect(
      page.getByRole("heading", { name: "Your comfort exchange" })
    ).toBeVisible();
    await page.goto("/requests");
    await expect(page.getByText("Not yet submitted")).toHaveCount(0);

    // Real progress DOES persist a resumable draft.
    await page.goto("/fitting");
    await page.getByLabel("Your experience").fill("Too firm for me.");
    await page.getByLabel("What you'd rather have").fill("Something softer.");
    await page.getByRole("button", { name: /Next — the mattress/ }).click();
    // Wait for the step to actually advance (the save is a server action;
    // navigating away too early would abort it mid-flight). The items step
    // asking for the model number proves the intake was persisted.
    await expect(page.getByText(/model number/i).first()).toBeVisible({ timeout: 15000 });
    await page.goto("/requests");
    await expect(page.getByText("Not yet submitted")).toBeVisible();
    await expect(page.getByText("Pick up where you left off")).toBeVisible();
  });

  test("the fitting keeps the sticky shell (punch list A)", async ({ page }) => {
    await enterAsCustomer(page);
    await setDemoDay(page, 31);
    await page.goto("/fitting");
    await expect(
      page.getByRole("heading", { name: "Your comfort exchange" })
    ).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  });
});

test.describe("re-filing a request (B-29, Doug 2026-07-27)", () => {
  test("a prior submitted request no longer blocks starting another", async ({ page }) => {
    // Calloway: day ~38 (in the window), request already submitted. Under B-29
    // this must NOT wall off a new request — duplicates are caught dealer-side.
    await page.goto("/");
    await page.getByLabel("Sales order number").fill("1011099412A");
    await page.getByLabel("Last name", { exact: true }).fill("Calloway");
    await page.getByRole("button", { name: "Find my purchase" }).click();
    await page.waitForURL("**/tonight");

    // Guarantee: the way in is open again — no "contact RAP" wall.
    await page.goto("/guarantee");
    await expect(page.getByText("contact RAP customer service")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Request an exchange" })).toBeVisible();

    // Requests: the existing submitted request still lists, AND a new one can start.
    await page.goto("/requests");
    await expect(page.getByRole("link", { name: "Start a new request" })).toBeVisible();

    // The fitting opens (the resumable/lazy draft flow works, not a refusal).
    await page.goto("/fitting");
    await expect(
      page.getByRole("heading", { name: "Your comfort exchange" })
    ).toBeVisible();
  });

  test("a resolved exchange still blocks — the one-time rule stays (terms)", async ({ page }) => {
    // Natarajan: day ~58, exchange APPROVED (resolved). The one-time cap holds.
    await page.goto("/");
    await page.getByLabel("Sales order number").fill("1011099450M");
    await page.getByLabel("Last name", { exact: true }).fill("Natarajan");
    await page.getByRole("button", { name: "Find my purchase" }).click();
    await page.waitForURL("**/tonight");

    await page.goto("/guarantee");
    await expect(page.getByRole("link", { name: "Request an exchange" })).toHaveCount(0);
    await expect(page.getByText(/one-time guarantee has been used/i)).toBeVisible();

    await page.goto("/fitting");
    await expect(
      page.getByRole("heading", { name: "Your comfort exchange" })
    ).toHaveCount(0);
  });
});

test.describe("customer RA document (Doug 2026-07-23)", () => {
  test("the owner opens their RA; anyone else gets a 404", async ({ page }) => {
    // Simmons holds a redeemed exchange with an RA on file.
    await page.goto("/");
    await page.getByLabel("Sales order number").fill("1011099478E");
    await page.getByLabel("Last name", { exact: true }).fill("Simmons");
    await page.getByRole("button", { name: "Find my purchase" }).click();
    await page.waitForURL("**/tonight");

    await page.goto("/requests");
    await page.getByRole("link", { name: "See the details" }).click();
    await page.waitForURL("**/requests/**");
    const raHref = await page
      .getByRole("link", { name: /Open the RA document/ })
      .getAttribute("href");
    await page.goto(raHref as string);
    await expect(page.getByText("Return Authorization", { exact: true })).toBeVisible();
    await expect(page.getByText("Gloria Simmons")).toBeVisible();

    // A different customer hitting the same URL sees a plain 404.
    const other = await page.context().browser()!.newContext();
    const otherPage = await other.newPage();
    await otherPage.goto("http://localhost:3100/");
    await otherPage.getByLabel("Sales order number").fill("123");
    await otherPage.getByLabel("Last name", { exact: true }).fill("demo");
    await otherPage.getByRole("button", { name: "Find my purchase" }).click();
    await otherPage.waitForURL("**/tonight");
    const res = await otherPage.request.get(`http://localhost:3100${raHref}`);
    expect(res.status()).toBe(404);
    await other.close();
  });
});

test.describe("staff desk (punch list D)", () => {
  async function enterAsRap(page: Page) {
    await page.goto("/admin");
    await page.getByRole("button", { name: "View as RAP admin" }).click();
    await page.waitForURL("**/admin");
  }

  test("Exchange requests: filters narrow the list", async ({ page }) => {
    await enterAsRap(page);
    await expect(page).toHaveTitle(/Exchange requests/);
    await expect(page.getByText("Evan Kowalski")).toBeVisible();

    // Status filter: only the approved request remains.
    await page.getByLabel("Status").selectOption("approved");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByText("Priya Natarajan")).toBeVisible();
    await expect(page.getByText("Evan Kowalski")).toHaveCount(0);
  });

  test("staff search finds by email and by formatted phone (Emmy)", async ({ page }) => {
    await enterAsRap(page);

    await page.getByLabel("Search").fill("d.calloway@example.com");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByText("Denise Calloway")).toBeVisible();
    await expect(page.getByText("Evan Kowalski")).toHaveCount(0);

    await page.getByLabel("Search").fill("(704) 555-0488");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByText("Evan Kowalski")).toBeVisible();
    await expect(page.getByText("Denise Calloway")).toHaveCount(0);
  });

  test("recording the exchange sales order completes the request", async ({ page }) => {
    await enterAsRap(page);
    await page.getByText("Priya Natarajan").click();
    await page.waitForURL("**/admin/requests/**");

    await expect(page.getByRole("link", { name: /Open the RA document/ })).toBeVisible();

    await page.getByLabel("Exchange sales order number").fill("1011099990E");
    await page.getByRole("button", { name: "Record exchange" }).click();

    await expect(page.getByText("1011099990E")).toBeVisible();
    await expect(page.getByText("This one's finished. Sleep well.")).toBeVisible();
  });

  test("a declined request can be reopened by admin (terminals unlocked)", async ({ page }) => {
    await enterAsRap(page);
    await page.getByText("Ray Delgado").click();
    await page.waitForURL("**/admin/requests/**");

    // Before the review, a denied claim offered no moves at all.
    await expect(page.getByText("Update status")).toBeVisible();
    await page
      .locator("form")
      .filter({ hasText: "In review" })
      .getByRole("button", { name: "In review", exact: true })
      .click();
    await expect(page.getByText("RAP is reading it over.")).toBeVisible();
  });

  test("coach usage report: RAP sees it, a dealer is bounced (B-11)", async ({ page }) => {
    await enterAsRap(page);
    await page.getByRole("link", { name: /Coach usage/ }).click();
    await page.waitForURL("**/admin/coach");
    await expect(page.getByRole("heading", { name: "Coach usage" })).toBeVisible();
    // The in-memory backend starts empty — the report says so, calmly.
    await expect(page.getByText("No coach conversations recorded yet")).toBeVisible();

    // A dealer never sees program AI spend: straight back to the desk.
    const dealer = await page.context().browser()!.newContext();
    const dealerPage = await dealer.newPage();
    await dealerPage.goto("http://localhost:3100/admin");
    await dealerPage.getByRole("button", { name: /View as Dealer/ }).click();
    // The picker click is a server action setting the demo cookie — wait for
    // the desk to actually render before navigating, or the cookie may not
    // exist yet (same in-flight-action race as the ghost-draft e2e).
    await expect(
      dealerPage.getByRole("heading", { name: "Exchange requests" })
    ).toBeVisible({ timeout: 15000 });
    await dealerPage.goto("http://localhost:3100/admin/coach");
    await dealerPage.waitForURL(/\/admin$/);
    await expect(
      dealerPage.getByRole("heading", { name: "Exchange requests" })
    ).toBeVisible();
    await dealer.close();
  });

  test("the RA document renders with the fee and signature lines", async ({ page }) => {
    await enterAsRap(page);
    await page.getByText("Evan Kowalski").click();
    await page.waitForURL("**/admin/requests/**");
    const href = await page
      .getByRole("link", { name: /Open the RA document/ })
      .getAttribute("href");
    await page.goto(href as string);
    await expect(page.getByText("Return Authorization", { exact: true })).toBeVisible();
    await expect(page.getByText("$199 comfort exchange fee")).toBeVisible();
    await expect(page.getByText("Customer signature")).toBeVisible();
  });
});
