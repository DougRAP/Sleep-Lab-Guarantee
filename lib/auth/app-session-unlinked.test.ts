// lib/auth/app-session-unlinked.test.ts
// v3 (M-S5) — the two gates for an UNLINKED real-auth account: the strict
// requireGuarantee still redirects (now to the tracking list, never the /link
// dead-end Doug hit), and requireSignedInAllowUnlinked lets the tracking
// surfaces render with a null guarantee.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRepository } from "../data/memory-repository";
import type { Role } from "../types";

let repo = new MemoryRepository();
let currentViewer: {
  userId: string;
  role: Role;
  email: string;
  dealerLocationId: string | null;
} | null = null;

vi.mock("../data", () => ({ getRepository: () => repo }));
vi.mock("./config", () => ({ isAuthConfigured: () => true }));
vi.mock("./user", () => ({ getViewer: async () => currentViewer }));
vi.mock("../active-guarantee", () => ({
  readActiveGuaranteeId: async () => undefined,
  resolveActiveGuarantee: (owned: { id: string }[]) => owned[0] ?? null,
  setActiveGuaranteeCookie: async () => {},
}));
vi.mock("../session", () => ({ getSession: async () => null }));
const REDIRECT = new Error("redirected");
let redirectedTo: string | null = null;
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    redirectedTo = to;
    throw REDIRECT;
  },
}));

const { requireGuarantee, requireSignedInAllowUnlinked } = await import("./app-session");

const CONSUMER = {
  userId: "auth-user-1",
  role: "consumer" as Role,
  email: "customer@example.com",
  dealerLocationId: null,
};

beforeEach(() => {
  repo = new MemoryRepository();
  currentViewer = null;
  redirectedTo = null;
});

describe("an unlinked consumer account (real auth)", () => {
  it("requireGuarantee redirects to the tracking list — not /link", async () => {
    currentViewer = CONSUMER;
    await expect(requireGuarantee()).rejects.toThrow(REDIRECT);
    expect(redirectedTo).toBe("/requests");
  });

  it("requireSignedInAllowUnlinked lets them through with a null guarantee", async () => {
    currentViewer = CONSUMER;
    const view = await requireSignedInAllowUnlinked();
    expect(view.guarantee).toBeNull();
    expect(view.session).toBeNull();
    expect(view.viewer?.userId).toBe("auth-user-1");
    expect(view.viewer?.email).toBe("customer@example.com");
  });

  it("both gates still turn an unauthenticated visitor to login", async () => {
    currentViewer = null;
    await expect(requireGuarantee()).rejects.toThrow(REDIRECT);
    expect(redirectedTo).toBe("/login");
    redirectedTo = null;
    await expect(requireSignedInAllowUnlinked()).rejects.toThrow(REDIRECT);
    expect(redirectedTo).toBe("/login");
  });

  it("staff never land on consumer tracking — they go to their desk", async () => {
    currentViewer = { ...CONSUMER, role: "rap_admin" };
    await expect(requireSignedInAllowUnlinked()).rejects.toThrow(REDIRECT);
    expect(redirectedTo).toBe("/admin");
  });
});

describe("a linked consumer account (real auth)", () => {
  it("both gates resolve the same guarantee", async () => {
    currentViewer = CONSUMER;
    await repo.linkGuaranteeToUser("seed-guarantee-demo", CONSUMER.userId, "lookup");

    const strict = await requireGuarantee();
    expect(strict.guarantee.id).toBe("seed-guarantee-demo");
    expect(strict.session.userId).toBe(CONSUMER.userId);

    const tolerant = await requireSignedInAllowUnlinked();
    expect(tolerant.guarantee?.id).toBe("seed-guarantee-demo");
    expect(tolerant.session?.guaranteeId).toBe("seed-guarantee-demo");
  });
});
