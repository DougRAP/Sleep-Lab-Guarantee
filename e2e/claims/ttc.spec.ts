// e2e/claims/ttc.spec.ts
// R-7, against a real server.
//
// The one thing that matters most about this endpoint is that it does not
// exist yet. Doug asked for it and said in the same breath "we need to talk
// about the communication", before Daniel had been in the room, so it ships
// switched off: with no TTC_WRITEBACK_SECRET it answers 501 and touches
// nothing. That is exactly the state every deployment is in today, so this is
// the real default under test rather than a mock of it.
//
// Both configs now blank TTC_WRITEBACK_SECRET explicitly, the way they blank
// the Supabase keys. Without that this file was hostage to whatever sat in a
// developer's .env.local: set the secret there and these tests flip to 401
// while their own comments insist they are proving the opposite.
//
// THE CEILING. The switched-ON path cannot be covered here without putting a
// secret into a config, which would make the suite prove the opposite of the
// thing above. Its parsing and its constant-time comparison are covered in
// lib/ttc.test.ts, the write itself in lib/data/tracking-repository.test.ts,
// and the handler's own ordering and status codes in lib/ttc-route.test.ts.

import { test, expect } from "@playwright/test";

const BODY = { claimNumber: "CG7MKQ42", ttcClaim: "TTC-9912" };

test.describe("R-7 — the TTC write-back is off until someone turns it on", () => {
  test("answers 501 with no secret configured", async ({ request }) => {
    // 501 and not 503: 503 means "come back later", so an integration's
    // ordinary backoff would retry a deliberately-off endpoint for ever.
    const res = await request.post("/api/ttc", { data: BODY });

    expect(res.status()).toBe(501);
    expect(await res.json()).toEqual({
      ok: false,
      code: "feature_off",
      error: "TTC write-back is not switched on",
    });
  });

  test("says the same thing however the caller announces itself", async ({
    request,
  }) => {
    // "Off" is decided before the credential is looked at, so a deployment
    // that has not enabled this answers the same to everyone. Note this is NOT
    // a claim that off and wrong-secret are indistinguishable in general: once
    // a secret IS configured, a wrong one gets 401, on purpose, because a
    // caller is owed the difference between "not on" and "bad credential".
    const res = await request.post("/api/ttc", {
      data: BODY,
      headers: { authorization: "Bearer whatever-they-think-it-is" },
    });

    expect(res.status()).toBe(501);
  });

  test("answers 405 to the verbs that would read or delete", async ({ request }) => {
    // One endpoint, one direction. Nothing here reads a claim back out. Named
    // for what it checks: OPTIONS is answered by Next with 204 and an Allow
    // header, not 405, so "every other verb" would have overclaimed.
    for (const res of [
      await request.get("/api/ttc"),
      await request.put("/api/ttc", { data: BODY }),
      await request.patch("/api/ttc", { data: BODY }),
      await request.delete("/api/ttc"),
    ]) {
      expect(res.status()).toBe(405);
    }
  });
});
