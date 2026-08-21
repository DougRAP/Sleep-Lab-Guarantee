// lib/ttc-route.test.ts
// R-7: the handler itself, which had no test at all until the adversarial
// review pointed out that only its two pure halves were covered. What was
// missing is the composition: the ORDER of the guards (which is what makes the
// inertness claim true), and the mapping from a null claim to a 404.
//
// It lives under lib/ because vitest.config.ts only collects lib/**\/*.test.ts.
// The handler is a plain async function over a Request, so it imports fine.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRepository } from "./data/memory-repository";
import { TTC_SECRET_ENV } from "./ttc";

const SECRET = "s3cret-value-from-the-env";

let repo: MemoryRepository;

vi.mock("./data", async () => {
  const actual = await vi.importActual<typeof import("./data")>("./data");
  return {
    ...actual,
    getRepository: () => repo,
    // The handler refuses to run on the in-memory backend, so for these tests
    // we say a real one is configured. That guard has its own test below.
    isSupabaseConfigured: () => configured,
  };
});

let configured = true;

const { POST } = await import("../app/api/ttc/route");

function post(body: unknown, secret?: string): Request {
  return new Request("http://localhost/api/ttc", {
    method: "POST",
    headers: secret
      ? { "content-type": "application/json", authorization: `Bearer ${secret}` }
      : { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** A submitted claim, and the CG number TTC would be sending us. */
async function aClaimNumber(): Promise<string> {
  const claim = await repo.createAnonymousClaim({
    firstName: "Terri",
    lastName: "Osborne",
    deliveryZip: "28105",
  });
  const { claimNumber } = await repo.submitClaim(claim.id);
  return claimNumber;
}

beforeEach(() => {
  repo = new MemoryRepository();
  configured = true;
  vi.stubEnv(TTC_SECRET_ENV, SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/ttc — off before anything else", () => {
  it("answers 501 with no secret configured, whatever the caller sends", async () => {
    // The claim about this endpoint that matters most, and the ordering is what
    // makes it true: nothing is parsed and no repository is touched.
    vi.stubEnv(TTC_SECRET_ENV, "");
    const cg = await aClaimNumber();

    const res = await POST(post({ claimNumber: cg, ttcClaim: "TTC-1" }, SECRET) as never);

    expect(res.status).toBe(501);
    expect(await res.json()).toEqual({
      ok: false,
      code: "feature_off",
      error: "TTC write-back is not switched on",
    });
    expect((await repo.getClaimByNumber(cg))?.ttcClaim ?? null).toBeNull();
  });

  it("answers 501 when there is no real database behind it", async () => {
    // A secret says nothing about the backend. Enabling write-back on the
    // in-memory seed would answer 200 for a write that evaporates on the next
    // restart, and the caller would record a successful handshake for nothing.
    configured = false;
    const cg = await aClaimNumber();

    const res = await POST(post({ claimNumber: cg, ttcClaim: "TTC-1" }, SECRET) as never);

    expect(res.status).toBe(501);
    expect((await repo.getClaimByNumber(cg))?.ttcClaim ?? null).toBeNull();
  });
});

describe("POST /api/ttc — the credential", () => {
  it("refuses a wrong secret, and a missing one, without reading the body", async () => {
    for (const req of [post({ claimNumber: "CG7MKQ42", ttcClaim: "T" }, "wrong"),
                       post({ claimNumber: "CG7MKQ42", ttcClaim: "T" })]) {
      const res = await POST(req as never);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({
        ok: false,
        code: "unauthorized",
        error: "unauthorized",
      });
    }
  });
});

describe("POST /api/ttc — the body", () => {
  it("tells a malformed reference apart from an unknown claim", async () => {
    const bad = await POST(post({ claimNumber: "hello", ttcClaim: "T" }, SECRET) as never);
    expect(bad.status).toBe(400);
    expect((await bad.json()).code).toBe("malformed_claim_number");

    // Well-formed and absent. NOT CG7MKQ42: that one is in the seed
    // (lib/data/seed.ts), which is exactly the trap that made the first cut of
    // this test pass a 200 while claiming to prove a 404.
    const unknown = await POST(
      post({ claimNumber: "CG234567", ttcClaim: "T" }, SECRET) as never
    );
    expect(unknown.status).toBe(404);
    expect((await unknown.json()).code).toBe("unknown_claim");
  });

  it("answers 400 to a body it cannot use, including broken JSON", async () => {
    for (const body of ["{not json", { claimNumber: "CG7MKQ42" }, [], "\"a string\""]) {
      const res = await POST(post(body, SECRET) as never);
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("malformed_body");
    }
  });
});

describe("POST /api/ttc — the write", () => {
  it("stores the number and answers with what it stored", async () => {
    const cg = await aClaimNumber();

    const res = await POST(post({ claimNumber: cg, ttcClaim: "TTC-9912" }, SECRET) as never);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, claimNumber: cg, ttcClaim: "TTC-9912" });
    expect((await repo.getClaimByNumber(cg))?.ttcClaim).toBe("TTC-9912");
  });

  it("stores nothing the caller sent beyond the two fields", async () => {
    const cg = await aClaimNumber();

    await POST(
      post({ claimNumber: cg, ttcClaim: "TTC-9912", status: "approved" }, SECRET) as never
    );

    const claim = (await repo.getClaimByNumber(cg))!;
    expect(claim.ttcClaim).toBe("TTC-9912");
    expect(claim.status).toBe("submitted");
  });

  it("reports a backend failure as 500, never as 'no such claim'", async () => {
    // The difference the integration lives on: 404 reads as an authoritative
    // denial and stops their retries for good, while 500 is "try again".
    const cg = await aClaimNumber();
    vi.spyOn(repo, "recordTtcClaim").mockRejectedValueOnce(new Error("boom"));

    const res = await POST(post({ claimNumber: cg, ttcClaim: "TTC-1" }, SECRET) as never);

    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe("backend_error");
  });
});
