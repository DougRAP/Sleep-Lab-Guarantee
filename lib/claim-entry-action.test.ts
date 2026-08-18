// lib/claim-entry-action.test.ts
// The v3 anonymous flow, run against the REAL server actions with the claimant
// session mocked: entry validation (either-or rules, calm failures), then the
// full path entry → details → qualifications → submit → CG number, including
// the auto-match and early-preference cases.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRepository } from "./data/memory-repository";
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
  form.set("contactEmail", "terri@example.com");
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
    expect(claim.contactEmail).toBe("terri@example.com");
    expect(claim.step).toBe("items");
  });

  it("accepts order-only identify (no ZIP) and phone-only contact", async () => {
    await start(
      entryForm({
        deliveryZip: "",
        salesOrderNumber: "1011099600S",
        contactEmail: "",
        contactPhone: "(704) 555-1340",
      })
    );
    const claim = (await repo.getClaimById(sessionClaimId!))!;
    expect(claim.deliveryZip).toBeNull();
    expect(claim.salesOrderNumber).toBe("1011099600S");
    expect(claim.contactPhone).toBe("(704) 555-1340");
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
