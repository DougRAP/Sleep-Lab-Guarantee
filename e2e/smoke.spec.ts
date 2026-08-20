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
    // The test above deliberately leaves a started draft on this purchase, and
    // this file shares one in-memory store, so since R-5 the landing is the
    // question. Answer it: the point of this test is the shell DURING the
    // flow, and the heading and the nav both sit outside the question, so it
    // would stay green while proving nothing.
    await page.getByRole("button", { name: "Pick it up where I left off" }).click();
    await expect(page.getByText(/model number/i).first()).toBeVisible();
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
    // Since R-5 it opens on the question, because Calloway has one on record.
    await page.goto("/fitting");
    await expect(
      page.getByRole("heading", { name: "Your comfort exchange" })
    ).toBeVisible();
    await page.getByRole("button", { name: "This is a new request" }).click();
    await expect(page.getByLabel("Your experience")).toBeVisible();
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

    await page.getByLabel("Search").fill("d.calloway@rapqa.com");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByText("Denise Calloway")).toBeVisible();
    await expect(page.getByText("Evan Kowalski")).toHaveCount(0);

    await page.getByLabel("Search").fill("(000) 555-0488");
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

test.describe("R-5 — new request or an existing one (Doug 2026-08-19)", () => {
  // "So what if I have one mattress and I return it, and I get another one, and
  // then I have another claim, I log in as Doug Wright, we should ask, is this
  // a new claim or an existing one?"
  //
  // Nothing here touches the anonymous front door. This only ever runs for
  // someone already signed in, which is why spec v3 §1 ("No login to file")
  // and the City Mattress promise are untouched.
  //
  // THE CEILING, stated plainly. These live here and not in e2e/claims/ because
  // no test there can reach /fitting at all: in claims mode "/" is the
  // anonymous claim door, and startAClaim files an anonymous claim rather than
  // reaching a linked purchase. And both configs blank the Supabase env, so
  // lib/auth/app-session.ts hands back userId: null and listClaimsForUser is
  // never called. That means the half of the rule that reads claims ACROSS
  // purchases — which is Doug's literal two-mattress case — cannot be covered
  // by any e2e here, under either config. Its nine unit tests carry it.
  //
  // Each test owns a staged purchase nothing else in this file drives, because
  // the store is shared and one earlier test deliberately leaves a draft
  // behind. Mendez, Fleming and Boyd are driven by nothing else, and the test
  // that leaves a draft behind tolerates finding its own on a re-run.

  /** Light verify, for a purchase other than the demo one. */
  async function enterAs(page: Page, salesOrder: string, lastName: string) {
    await page.goto("/");
    await page.getByLabel("Sales order number").fill(salesOrder);
    await page.getByLabel("Last name", { exact: true }).fill(lastName);
    await page.getByRole("button", { name: "Find my purchase" }).click();
    await page.waitForURL("**/tonight");
  }

  test("a first-time customer is asked nothing", async ({ page }) => {
    // Mendez has no claims of any kind, so there is nothing to be confused
    // with and the question would be pure noise on the way into an empty form.
    await enterAs(page, "1011099502M", "Mendez");
    await setDemoDay(page, 31);
    await page.goto("/fitting");

    await expect(page.getByLabel("Your experience")).toBeVisible();
    await expect(page.getByRole("button", { name: /This is a new request/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Pick it up/ })).toHaveCount(0);
  });

  test("a request already under way is offered, not silently resumed", async ({
    page,
  }) => {
    await enterAs(page, "1011099501F", "Fleming");
    await setDemoDay(page, 31);

    // This test creates a draft and cannot remove it, so on a retry (or a
    // second local run against the same warm server) it starts where it
    // finished. Answer the question if it is already there, and the rest holds
    // either way.
    await page.goto("/fitting");
    const resume = page.getByRole("button", { name: "Pick it up where I left off" });
    if (await resume.isVisible().catch(() => false)) await resume.click();

    // Leave real progress behind, the same way the ghost-fix test does.
    await page.getByLabel("Your experience").fill("Too firm for me.");
    await page.getByLabel("What you'd rather have").fill("Something softer.");
    await page.getByRole("button", { name: /Next — the mattress/ }).click();
    await expect(page.getByText(/model number/i).first()).toBeVisible({ timeout: 15000 });

    // Come back on a clean sitting. Before R-5 this dropped straight into the
    // resumed step with no word about it. The answer is remembered per tab, so
    // a fresh context is what a returning customer actually looks like.
    const fresh = await page.context().browser()!.newContext();
    const later = await fresh.newPage();
    await enterAs(later, "1011099501F", "Fleming");
    await setDemoDay(later, 31);
    await later.goto("/fitting");

    await expect(later.getByText(/already have a request under way/i)).toBeVisible();
    await expect(later.getByText(/one request going at a time/i)).toBeVisible();
    await expect(later.getByLabel("Your experience")).toHaveCount(0);
    // A yes-or-no question gets a no, and it is a real way out.
    await expect(
      later.getByRole("link", { name: "Not now, see my requests" })
    ).toBeVisible();

    // Picking it up lands exactly where it used to, with the words still there.
    await later.getByRole("button", { name: "Pick it up where I left off" }).click();
    await expect(later.getByText(/model number/i).first()).toBeVisible();

    // And it stays answered across a reload, which is what coming back from the
    // camera looks like on a phone.
    await later.reload();
    await expect(later.getByText(/model number/i).first()).toBeVisible();
    await expect(later.getByText(/already have a request under way/i)).toHaveCount(0);

    await fresh.close();
  });

  test("being asked creates nothing (the lazy-draft rule still holds)", async ({
    page,
  }) => {
    // Boyd has a request in review and no draft, so the question renders, and
    // "in_review" is not one of the statuses that resolve the exchange, so the
    // window is still open and the page gets this far. Merely being asked must
    // not mint a draft: /requests would grow a "Not yet submitted" row if it
    // did.
    await enterAs(page, "1011099437K", "Boyd");

    await page.goto("/fitting");
    await expect(page.getByText(/Is this a new one/i)).toBeVisible();

    await page.goto("/requests");
    await expect(page.getByText("Not yet submitted")).toHaveCount(0);
  });
});
