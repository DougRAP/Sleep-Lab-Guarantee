// lib/lookup-guard.test.ts
// B-13 Pieza 1: the lookup guard blocks after the per-order limit, with a
// message distinct from "not found", and fails open on trouble. next/headers
// is mocked because the guard reads the client IP.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({
  headers: async () => new Map([["x-nf-client-connection-ip", "203.0.113.9"]]),
}));

// A tiny in-process repo double: real MemoryRepository backs the counters.
import { MemoryRepository } from "./data/memory-repository";

const repo = new MemoryRepository();
vi.mock("./data", () => ({ getRepository: () => repo }));

// Import AFTER mocks are registered.
const { guardLookupAttempt } = await import("./actions/lookup-guard");

beforeEach(() => {
  // Fresh counters each test by swapping the shared repo's internals is
  // awkward; instead use a unique order per test so windows don't collide.
});

describe("guardLookupAttempt", () => {
  it("allows the first 5 attempts on an order, blocks the 6th within the hour", async () => {
    const order = "ORDER-AAA-" + Math.floor(performance.now());
    for (let i = 1; i <= 5; i++) {
      const r = await guardLookupAttempt(order);
      expect(r.ok).toBe(true);
    }
    const sixth = await guardLookupAttempt(order);
    expect(sixth.ok).toBe(false);
    expect(sixth.error).toMatch(/too many/i);
    // The block message must never equal the not-found copy.
    expect(sixth.error).not.toMatch(/couldn't find/i);
  });

  it("is case/space-insensitive on the order key (same bucket)", async () => {
    const base = "ORDER-BBB-" + Math.floor(performance.now());
    for (let i = 0; i < 5; i++) await guardLookupAttempt(base);
    const variant = await guardLookupAttempt(`  ${base.toLowerCase()}  `);
    expect(variant.ok).toBe(false);
  });
});
