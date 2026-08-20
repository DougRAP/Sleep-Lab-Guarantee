// lib/claim-entry-action.test.ts
// The v3 anonymous flow, run against the REAL server actions with the claimant
// session mocked: entry validation (either-or rules, calm failures), then the
// full path entry → details → qualifications → submit → CG number, including
// the auto-match and early-preference cases.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRepository } from "./data/memory-repository";
import { MAX_STORY_CHARS } from "./claim-flow";
import { CONFIRMATION_KEYS } from "./fitting";
import { isClaimNumber } from "./ra";

let repo = new MemoryRepository();
let sessionClaimId: string | null = null;

vi.mock("./data", () => ({ getRepository: () => repo }));
vi.mock("./claim-session", () => ({
  setClaimSession: async (claimId: string) => {
    sessionClaimId = claimId;
  },
  getClaimSession: async () =>
    sessionClaimId ? { claimId: sessionClaimId, iat: Date.now() } : null,
  clearClaimSession: async () => {
    sessionClaimId = null;
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }),
}));
const REDIRECT = new Error("redirected");
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    (REDIRECT as Error & { to?: string }).to = to;
    throw REDIRECT;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { startClaimAction, saveClaimDetails, saveClaimQualifications, submitAnonymousClaim } =
  await import("./actions/claim");

function entryForm(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set("firstName", "Terri");
  form.set("lastName", "Osborne");
  form.set("salesOrderNumber", "");
  form.set("deliveryZip", "28105");
  form.set("contactEmail", "terri@rapqa.com");
  form.set("contactPhone", "");
  for (const [k, v] of Object.entries(overrides)) form.set(k, v);
  return form;
}

function detailsForm(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set("modelNumber", "PL-2290");
  form.set("purchaseDate", "2026-11-20");
  form.set("deliveryDate", "2026-11-22"); // day 40 at the pinned clock
  form.set("salesOrderNumber", "");
  for (const [k, v] of Object.entries(overrides)) form.set(k, v);
  return form;
}

/** Runs the entry action, swallowing its success redirect. */
async function start(form: FormData) {
  try {
    return await startClaimAction(form);
  } catch (e) {
    if (e !== REDIRECT) throw e;
    return null; // redirected = success
  }
}

beforeEach(() => {
  repo = new MemoryRepository();
  sessionClaimId = null;
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2027-01-01T12:00:00.000Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("startClaimAction — the entry form", () => {
  it("creates the anonymous draft, stores contact, and steps into the flow", async () => {
    const result = await start(entryForm());
    expect(result).toBeNull(); // redirected to /claim
    expect(sessionClaimId).toBeTruthy();

    const claim = (await repo.getClaimById(sessionClaimId!))!;
    expect(claim.status).toBe("draft");
    expect(claim.guaranteeId).toBeNull();
    expect(claim.firstName).toBe("Terri");
    expect(claim.lastName).toBe("Osborne");
    expect(claim.deliveryZip).toBe("28105");
    expect(claim.contactEmail).toBe("terri@rapqa.com");
    expect(claim.step).toBe("items");
  });

  it("accepts order-only identify (no ZIP) and phone-only contact", async () => {
    await start(
      entryForm({
        deliveryZip: "",
        salesOrderNumber: "1011099600S",
        contactEmail: "",
        contactPhone: "(000) 555-1340",
      })
    );
    const claim = (await repo.getClaimById(sessionClaimId!))!;
    expect(claim.deliveryZip).toBeNull();
    expect(claim.salesOrderNumber).toBe("1011099600S");
    expect(claim.contactPhone).toBe("(000) 555-1340");
    expect(claim.contactPhoneKind).toBe("mobile");
  });

  it("refuses calmly when neither identifier or neither contact is given", async () => {
    const noId = await start(entryForm({ deliveryZip: "", salesOrderNumber: "" }));
    expect(noId).toEqual({
      ok: false,
      error: expect.stringMatching(/either one is fine/i),
    });
    const noContact = await start(entryForm({ contactEmail: "", contactPhone: "" }));
    expect(noContact?.ok).toBe(false);
    // Nothing was created or remembered on a refusal.
    expect(sessionClaimId).toBeNull();
  });
});

describe("the full anonymous flow", () => {
  it("entry → details → qualifications → submit mints a CG number", async () => {
    await start(entryForm());

    const details = await saveClaimDetails(detailsForm());
    expect(details.ok).toBe(true);
    if (details.ok) {
      expect(details.data.day).toBe(40);
      expect(details.data.message).toMatch(/night 40/);
    }

    const quals = await saveClaimQualifications({
      confirmations: [...CONFIRMATION_KEYS],
      protectorUsed: true,
    });
    expect(quals.ok).toBe(true);

    // Photos untouched on purpose — they never gate (spec §2.6).
    const submitted = await submitAnonymousClaim();
    expect(submitted.ok).toBe(true);
    if (submitted.ok) expect(isClaimNumber(submitted.data.claimNumber)).toBe(true);

    const claim = (await repo.getClaimById(sessionClaimId!))!;
    expect(claim.status).toBe("submitted");
    expect(claim.daysInServiceAtSubmit).toBe(40);
    expect(claim.protectorUsed).toBe(true);
    expect(claim.earlyPreference).toBeNull();
    expect(claim.raNumber).toBeNull();
    expect(claim.trackingNumber).toBeNull();
  });

  it("auto-matches at submit when ZIP + last name land on a registered guarantee", async () => {
    await start(entryForm({ firstName: "Denise", lastName: "Calloway", deliveryZip: "28150" }));
    await saveClaimDetails(detailsForm());
    await saveClaimQualifications({
      confirmations: [...CONFIRMATION_KEYS],
      protectorUsed: false,
    });
    const submitted = await submitAnonymousClaim();
    expect(submitted.ok).toBe(true);
    expect((await repo.getClaimById(sessionClaimId!))?.guaranteeId).toBe(
      "seed-guarantee-calloway"
    );
  });

  it("an early delivery date requires the choice, stores it, and submits", async () => {
    await start(entryForm());
    // Delivered 7 nights before the pinned clock — early.
    const missing = await saveClaimDetails(detailsForm({ deliveryDate: "2026-12-25" }));
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toMatch(/night 31/i);

    const chosen = await saveClaimDetails(
      detailsForm({ deliveryDate: "2026-12-25", earlyPreference: "auto_submit_day_31" })
    );
    expect(chosen.ok).toBe(true);

    await saveClaimQualifications({
      confirmations: [...CONFIRMATION_KEYS],
      protectorUsed: false,
    });
    const submitted = await submitAnonymousClaim();
    expect(submitted.ok).toBe(true);
    const claim = (await repo.getClaimById(sessionClaimId!))!;
    expect(claim.earlyPreference).toBe("auto_submit_day_31");
    expect(claim.daysInServiceAtSubmit).toBe(7);
  });

  it("refuses to submit before the confirmations are in", async () => {
    await start(entryForm());
    await saveClaimDetails(detailsForm());
    const submitted = await submitAnonymousClaim();
    expect(submitted.ok).toBe(false);
  });

  it("an incomplete confirmation set is refused server-side", async () => {
    await start(entryForm());
    await saveClaimDetails(detailsForm());
    const quals = await saveClaimQualifications({
      confirmations: CONFIRMATION_KEYS.slice(0, 3),
      protectorUsed: false,
    });
    expect(quals.ok).toBe(false);
  });
});

describe("startClaimAction — coming back to the front door (wizard)", () => {
  // The Back on the first step lands here, with the form already filled. Pressing
  // Get started again has to EDIT the request in flight, not open a second one,
  // or every customer who steps back leaves an orphan in the dashboard.
  it("reuses the open draft instead of minting another", async () => {
    await start(entryForm());
    const first = sessionClaimId!;

    await start(entryForm({ lastName: "Osborne-Reid", deliveryZip: "28110" }));

    expect(sessionClaimId).toBe(first);
    const claim = (await repo.getClaimById(first))!;
    expect(claim.lastName).toBe("Osborne-Reid");
    expect(claim.deliveryZip).toBe("28110");
    expect(claim.firstName).toBe("Terri");
  });

  it("keeps the progress already made rather than resetting to step one", async () => {
    await start(entryForm());
    await saveClaimDetails(detailsForm());
    const before = (await repo.getClaimById(sessionClaimId!))!;
    expect(before.step).toBe("confirmations");
    expect(before.modelNumber).toBe("PL-2290");

    await start(entryForm({ contactEmail: "terri.new@rapqa.com" }));

    const after = (await repo.getClaimById(sessionClaimId!))!;
    expect(after.contactEmail).toBe("terri.new@rapqa.com");
    // Editing who you are must not throw away what you already filled in.
    expect(after.modelNumber).toBe("PL-2290");
    expect(after.step).toBe("confirmations");
  });

  it("opens a fresh request once the previous one is submitted", async () => {
    await start(entryForm());
    const first = sessionClaimId!;
    await saveClaimDetails(detailsForm());
    await saveClaimQualifications({ confirmations: CONFIRMATION_KEYS, protectorUsed: false });
    await submitAnonymousClaim();

    await start(entryForm());

    expect(sessionClaimId).not.toBe(first);
  });
});

describe("saveClaimDetails — dates that cannot both be true (R-3)", () => {
  // The client refuses these too, but the server is the authority: a form can
  // be posted without ever rendering the step.
  it("refuses a delivery date in the future", async () => {
    await start(entryForm());
    // The suite's clock is pinned to 2027-01-01.
    const res = await saveClaimDetails(
      detailsForm({ purchaseDate: "2026-12-01", deliveryDate: "2027-02-10" })
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/delivery date/i);

    const claim = (await repo.getClaimById(sessionClaimId!))!;
    expect(claim.deliveryDate).toBeNull();
    expect(claim.step).toBe("items");
  });

  it("refuses a purchase date after the delivery date (Emy's case)", async () => {
    await start(entryForm());
    const res = await saveClaimDetails(
      detailsForm({ purchaseDate: "2026-08-04", deliveryDate: "2026-07-29" })
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/purchase date/i);
  });

  it("still lets an ordinary pair through, and still counts the nights", async () => {
    await start(entryForm());
    const res = await saveClaimDetails(detailsForm());
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.day).toBe(40);
  });

  it("does not block a request that is simply past the window", async () => {
    // R-3 is a typo guard. Past night 90 still submits, as v3 requires.
    await start(entryForm());
    const res = await saveClaimDetails(
      detailsForm({ purchaseDate: "2026-01-01", deliveryDate: "2026-01-05" })
    );
    expect(res.ok).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* R-8 — the customer's own account, through the action                       */
/* -------------------------------------------------------------------------- */

// The pure rule has its own tests in lib/claim-flow.test.ts. These are about
// the integration R-8 actually adds: that saveClaimDetails persists the two
// fields at all, that whitespace is stored as nothing rather than opening an
// empty section on the agent's screen, and that the paragraph bound is applied
// server-side, where a hand-rolled POST cannot get past it.

describe("R-8 — what the customer wrote reaches the record", () => {
  it("persists both fields", async () => {
    await start(entryForm());
    const said = "It's firmer than I expected, and my shoulder wakes me.";
    const wanted = "Something softer through the shoulder.";

    const res = await saveClaimDetails(
      detailsForm({ reasonExperience: said, preferredReplacement: wanted })
    );
    expect(res.ok).toBe(true);

    const claim = (await repo.getClaimById(sessionClaimId!))!;
    expect(claim.reasonExperience).toBe(said);
    expect(claim.preferredReplacement).toBe(wanted);
  });

  it("stores nothing when they wrote nothing", async () => {
    // Both detail views decide whether to render on truthiness or .trim(), so
    // a stored " " would open a section with nothing in it, which reads worse
    // than the honest "Nothing recorded here" it would replace.
    await start(entryForm());

    await saveClaimDetails(
      detailsForm({ reasonExperience: "   ", preferredReplacement: "" })
    );

    const claim = (await repo.getClaimById(sessionClaimId!))!;
    expect(claim.reasonExperience).toBeNull();
    expect(claim.preferredReplacement).toBeNull();
  });

  it("keeps their paragraph breaks and trims only the edges", async () => {
    await start(entryForm());
    const said = `Too firm through the shoulder.

My partner is fine with it.`;

    await saveClaimDetails(detailsForm({ reasonExperience: `  ${said}  ` }));

    expect((await repo.getClaimById(sessionClaimId!))!.reasonExperience).toBe(said);
  });

  it("bounds a paragraph on the server, trimming before it cuts", async () => {
    // The control carries maxLength, but the control is not the authority: a
    // posted form never rendered it. Trim first, then cap, the same way round
    // as the fitting, or a paste that begins with a blank line loses its tail.
    await start(entryForm());
    const long = "x".repeat(MAX_STORY_CHARS + 500);

    await saveClaimDetails(detailsForm({ reasonExperience: `   ${long}` }));

    const claim = (await repo.getClaimById(sessionClaimId!))!;
    expect(claim.reasonExperience).toHaveLength(MAX_STORY_CHARS);
  });

  it("is optional: neither field can hold the step closed", async () => {
    await start(entryForm());
    const res = await saveClaimDetails(detailsForm());
    expect(res.ok).toBe(true);
    const claim = (await repo.getClaimById(sessionClaimId!))!;
    expect(claim.reasonExperience).toBeNull();
    expect(claim.step).toBe("confirmations");
  });
});
