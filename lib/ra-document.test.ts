// lib/ra-document.test.ts
// The RA number exists from submit (it's the claim's reference), but the
// DOCUMENT only exists once RAP has authorized the exchange.

import { describe, expect, it } from "vitest";
import { raDocumentAvailable } from "./ra-document";

describe("raDocumentAvailable", () => {
  it("only after RAP authorizes", () => {
    expect(raDocumentAvailable("approved")).toBe(true);
    expect(raDocumentAvailable("dealer_scheduled")).toBe(true);
    expect(raDocumentAvailable("completed")).toBe(true);
  });

  it("never before adjudication, and never on a refused request", () => {
    expect(raDocumentAvailable("draft")).toBe(false);
    expect(raDocumentAvailable("submitted")).toBe(false);
    expect(raDocumentAvailable("in_review")).toBe(false);
    expect(raDocumentAvailable("denied")).toBe(false);
    expect(raDocumentAvailable("withdrawn")).toBe(false);
    expect(raDocumentAvailable("expired")).toBe(false);
  });
});
