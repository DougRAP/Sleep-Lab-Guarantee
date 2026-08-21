// lib/ttc.test.ts
// R-7: the pure half of the TTC write-back. Everything here is decided without
// touching the network, the database or a request object.
//
// Doug, on the call: "it should have two fields in there, one for an app claim
// number and one for a TTC claim number, because I'm thinking that Daniel
// should write back the TTC number to this database. Okay, yes, WE NEED TO TALK
// ABOUT THE COMMUNICATION, because AN OPTION CAN BE create an API that listens
// from here and writes the record the same way they currently do."
//
// The direction is stated: they push, we listen. The contract is not agreed,
// and he says so in the same breath. So the feature ships OFF, and the first
// test below is the one that matters most.

import { describe, expect, it } from "vitest";
import { MAX_TTC_CHARS, authorizeTtcWriteBack, parseTtcWriteBack } from "./ttc";

const SECRET = "s3cret-value-from-the-env";

describe("authorizeTtcWriteBack — off until someone switches it on", () => {
  it("is off when no secret is configured", () => {
    // The default state on every deployment, and it must stay the default
    // until Daniel and Doug have agreed a contract. Nothing else turns it on.
    expect(authorizeTtcWriteBack(undefined, "anything")).toBe("not-configured");
    expect(authorizeTtcWriteBack("", "anything")).toBe("not-configured");
    expect(authorizeTtcWriteBack("   ", "anything")).toBe("not-configured");
  });

  it("refuses a caller who presents nothing", () => {
    expect(authorizeTtcWriteBack(SECRET, undefined)).toBe("unauthorized");
    expect(authorizeTtcWriteBack(SECRET, "")).toBe("unauthorized");
  });

  it("refuses a wrong secret, including one that only differs in length", () => {
    expect(authorizeTtcWriteBack(SECRET, "wrong")).toBe("unauthorized");
    expect(authorizeTtcWriteBack(SECRET, SECRET + "x")).toBe("unauthorized");
    expect(authorizeTtcWriteBack(SECRET, SECRET.slice(0, -1))).toBe("unauthorized");
  });

  it("accepts the configured secret", () => {
    expect(authorizeTtcWriteBack(SECRET, SECRET)).toBe("ok");
  });

  it("accepts it when the caller sends it as a bearer token", () => {
    expect(authorizeTtcWriteBack(SECRET, `Bearer ${SECRET}`)).toBe("ok");
  });

  it("accepts a secret that itself begins with Bearer", () => {
    // Stripping the prefix unconditionally meant this could never authenticate:
    // the configured value kept its prefix and the presented one lost it. An
    // operator pasting a whole header line out of a document hits exactly this.
    const odd = "Bearer 7f2a-not-a-scheme";
    expect(authorizeTtcWriteBack(odd, odd)).toBe("ok");
    expect(authorizeTtcWriteBack(odd, `Bearer ${odd}`)).toBe("ok");
  });

  it("is not fooled by a value that merely starts the same", () => {
    expect(authorizeTtcWriteBack("abc", "abcdef")).toBe("unauthorized");
    expect(authorizeTtcWriteBack("abcdef", "abc")).toBe("unauthorized");
  });
});

describe("parseTtcWriteBack — a claim number and a TTC number, nothing else", () => {
  it("takes the pair and trims it", () => {
    expect(parseTtcWriteBack({ claimNumber: " CG7MKQ42 ", ttcClaim: " TTC-9912 " })).toEqual({
      ok: true,
      claimNumber: "CG7MKQ42",
      ttcClaim: "TTC-9912",
    });
  });

  it("leaves the claim number exactly as sent, for the repository to normalize", () => {
    // getClaimByNumber already folds case and a missing CG prefix
    // (claimNumberQuery), so re-doing it here would be a second rule to keep
    // in step with the first.
    const parsed = parseTtcWriteBack({ claimNumber: "cg7mkq42", ttcClaim: "T1" });
    expect(parsed.ok && parsed.claimNumber).toBe("cg7mkq42");
  });

  it("tells a malformed reference apart from an unknown claim", () => {
    // Both used to answer 404, so a transcription slip (an O for a 0, an
    // internal space, one of the glyphs the alphabet excludes) landed in the
    // same bucket as a claim we have genuinely never heard of. The caller
    // could not triage the two, and the second one is theirs to fix.
    for (const bad of ["hello", "CG7 MKQ42", "CG7MKQ4", "CGIO0U12", "12345"]) {
      const parsed = parseTtcWriteBack({ claimNumber: bad, ttcClaim: "T1" });
      expect(parsed).toEqual({ ok: false, reason: "malformed-claim-number" });
    }
  });

  it("still accepts every shape the repository would have found", () => {
    for (const good of ["CG7MKQ42", "cg7mkq42", "7MKQ42", "  CG7MKQ42  "]) {
      expect(parseTtcWriteBack({ claimNumber: good, ttcClaim: "T1" }).ok).toBe(true);
    }
  });

  it("refuses anything that is not a usable pair", () => {
    for (const body of [
      null,
      undefined,
      "a string",
      42,
      {},
      { claimNumber: "CG7MKQ42" },
      { ttcClaim: "TTC-9912" },
      { claimNumber: "", ttcClaim: "TTC-9912" },
      { claimNumber: "   ", ttcClaim: "TTC-9912" },
      { claimNumber: "CG7MKQ42", ttcClaim: "" },
      { claimNumber: "CG7MKQ42", ttcClaim: "  " },
      { claimNumber: 7, ttcClaim: "TTC-9912" },
      { claimNumber: "CG7MKQ42", ttcClaim: { nested: true } },
    ]) {
      const parsed = parseTtcWriteBack(body);
      expect(parsed).toEqual({ ok: false, reason: "malformed-body" });
    }
  });

  it("ignores anything else the caller sends", () => {
    // Doug asked for the TTC number. A status was my own guess and is not in
    // the transcript, so an endpoint that quietly accepted one would be
    // inventing the contract Daniel has not agreed yet.
    const parsed = parseTtcWriteBack({
      claimNumber: "CG7MKQ42",
      ttcClaim: "TTC-9912",
      status: "approved",
      notes: "please close this",
    });
    expect(parsed).toEqual({ ok: true, claimNumber: "CG7MKQ42", ttcClaim: "TTC-9912" });
  });

  it("bounds the TTC number like any other single line", () => {
    const long = "T".repeat(MAX_TTC_CHARS + 50);
    const parsed = parseTtcWriteBack({ claimNumber: "CG7MKQ42", ttcClaim: long });
    expect(parsed.ok && parsed.ttcClaim).toHaveLength(MAX_TTC_CHARS);
  });

  it("never cuts a character in half", () => {
    // Slicing by UTF-16 unit through an emoji leaves a lone surrogate, which
    // Postgres refuses outright: the whole write would fail and the caller
    // would be told their number was the problem.
    const parsed = parseTtcWriteBack({
      claimNumber: "CG7MKQ42",
      ttcClaim: "T".repeat(MAX_TTC_CHARS - 1) + "\u{1F600}",
    });
    const stored = parsed.ok ? parsed.ttcClaim : "";
    expect(stored).toHaveLength(MAX_TTC_CHARS - 1);
    expect(/[\uD800-\uDFFF]/.test(stored)).toBe(false);
    expect(JSON.parse(JSON.stringify(stored))).toBe(stored);
  });

  it("keeps an identifier on one line, with nothing hidden in it", () => {
    // This lands on the staff desk as the production system's own reference,
    // in a cell that wraps. Left alone it is 200 characters of somewhere to
    // write "VERIFY: CALL 704-555-0148" to a person with authority over
    // exchanges. It is an identifier, so it is cleaned like one.
    const parsed = parseTtcWriteBack({
      claimNumber: "CG7MKQ42",
      ttcClaim: "TTC-1\nCall 1-800-EVIL now\u202E\u200B",
    });
    const stored = parsed.ok ? parsed.ttcClaim : "";
    expect(stored).not.toMatch(/[\n\r\t]/);
    expect(stored).not.toMatch(/[\u202A-\u202E\u200B-\u200F]/);
    expect(stored.startsWith("TTC-1")).toBe(true);
  });
});
