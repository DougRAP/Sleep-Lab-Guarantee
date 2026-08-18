// lib/staff-link-action.test.ts
// v3 (M-S4) — the claim-links write path, run against the REAL server action:
// RAP attaches document links; dealers (and anonymous visitors) never write.
// Follows the fitting-caps-action pattern: real MemoryRepository, mocked view.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRepository } from "./data/memory-repository";
import type { StaffView } from "./auth/staff-view";

let repo = new MemoryRepository();
let currentView: StaffView | null = null;

vi.mock("./data", () => ({ getRepository: () => repo }));
vi.mock("./auth/staff-view", () => ({
  getStaffView: async () => currentView,
  staffScope: (view: StaffView) =>
    view.role === "dealer" && view.dealerLocationId
      ? { kind: "dealer_location", dealerLocationId: view.dealerLocationId }
      : { kind: "all" },
}));
vi.mock("./auth/demo-staff-server", () => ({
  setDemoStaffView: async () => false,
  clearDemoStaffView: async () => {},
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));

const { addClaimLinkAction } = await import("./actions/staff");

const RAP: StaffView = {
  role: "rap_admin",
  dealerLocationId: null,
  demo: false,
  userId: "rap-user-1",
  email: "agent@raptns.com",
};
const DEALER: StaffView = {
  role: "dealer",
  dealerLocationId: "101",
  demo: false,
  userId: "dealer-user-1",
  email: "store@dealer.example",
};

/** The seeded anonymous claim — a real, submitted claim on the desk. */
const CLAIM_ID = "seed-claim-osborne";

function linkForm(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set("claimId", CLAIM_ID);
  form.set("kind", "exchange_authorization");
  form.set("url", "https://example.com/docs/ea.pdf");
  form.set("label", "Exchange Authorization");
  for (const [k, v] of Object.entries(overrides)) form.set(k, v);
  return form;
}

beforeEach(() => {
  repo = new MemoryRepository();
  currentView = null;
});

describe("addClaimLinkAction — permissions", () => {
  it("RAP attaches a link, stamped with their user id", async () => {
    currentView = RAP;
    await addClaimLinkAction(linkForm());

    const links = await repo.listClaimLinks(CLAIM_ID);
    expect(links).toHaveLength(1);
    expect(links[0].kind).toBe("exchange_authorization");
    expect(links[0].url).toBe("https://example.com/docs/ea.pdf");
    expect(links[0].label).toBe("Exchange Authorization");
    expect(links[0].createdBy).toBe("rap-user-1");
  });

  it("a dealer is refused — the list stays read-only for them", async () => {
    currentView = DEALER;
    await addClaimLinkAction(linkForm());
    expect(await repo.listClaimLinks(CLAIM_ID)).toEqual([]);
  });

  it("no staff view, no write", async () => {
    currentView = null;
    await addClaimLinkAction(linkForm());
    expect(await repo.listClaimLinks(CLAIM_ID)).toEqual([]);
  });
});

describe("addClaimLinkAction — input guards", () => {
  it("refuses a non-http(s) URL (no javascript: links into the desk)", async () => {
    currentView = RAP;
    // eslint-disable-next-line no-script-url
    await addClaimLinkAction(linkForm({ url: "javascript:alert(1)" }));
    await addClaimLinkAction(linkForm({ url: "not a url" }));
    expect(await repo.listClaimLinks(CLAIM_ID)).toEqual([]);
  });

  it("refuses an unknown kind", async () => {
    currentView = RAP;
    await addClaimLinkAction(linkForm({ kind: "malware" }));
    expect(await repo.listClaimLinks(CLAIM_ID)).toEqual([]);
  });

  it("quietly no-ops on a claim that doesn't exist", async () => {
    currentView = RAP;
    await addClaimLinkAction(linkForm({ claimId: "no-such-claim" }));
    expect(await repo.listClaimLinks("no-such-claim")).toEqual([]);
  });

  it("stores a null label when none is given", async () => {
    currentView = RAP;
    await addClaimLinkAction(linkForm({ label: "" }));
    const [link] = await repo.listClaimLinks(CLAIM_ID);
    expect(link.label).toBeNull();
  });
});
