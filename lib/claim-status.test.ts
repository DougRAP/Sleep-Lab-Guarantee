// lib/claim-status.test.ts
// The status vocabulary is shared between the consumer's /requests and staff's
// /admin — so it is tested once, here, as the single source of both.

import { describe, expect, it } from "vitest";
import { statusLabel, statusNextStep } from "./claim-status";
import type { ClaimStatus } from "./types";

const ALL_STATUSES: ClaimStatus[] = [
  "draft",
  "submitted",
  "in_review",
  "inspection_scheduled",
  "approved",
  "dealer_scheduled",
  "completed",
  "denied",
  "expired",
  "withdrawn",
];

describe("statusLabel", () => {
  it("gives every status a plain-language label", () => {
    for (const status of ALL_STATUSES) {
      expect(statusLabel(status).length).toBeGreaterThan(0);
    }
  });

  it("never leaks the raw machine key to a human", () => {
    for (const status of ALL_STATUSES) {
      expect(statusLabel(status)).not.toBe(status);
    }
  });

  it("keeps the labels the admin list already used", () => {
    expect(statusLabel("draft")).toBe("In progress");
    expect(statusLabel("submitted")).toBe("Submitted");
    expect(statusLabel("dealer_scheduled")).toBe("Scheduled");
    expect(statusLabel("denied")).toBe("Declined");
  });

  it("calls the finished exchange Redeemed (Doug, 2026-07-23)", () => {
    expect(statusLabel("completed")).toBe("Redeemed");
  });
});

describe("statusNextStep", () => {
  it("answers 'what happens now?' for every status", () => {
    for (const status of ALL_STATUSES) {
      expect(statusNextStep(status).trim().length).toBeGreaterThan(0);
    }
  });

  it("sends a draft back to finish, and a submitted request to the dealer", () => {
    expect(statusNextStep("draft")).toBe(
      "Pick up where you left off whenever you're ready."
    );
    expect(statusNextStep("submitted")).toBe(
      "RAP has your request. You'll hear from your dealer about next steps."
    );
  });

  it("carries no ticket language anywhere (DESIGN.md anti-patterns)", () => {
    const banned = /ticket|case number|submit a request|process your request|queue/i;
    for (const status of ALL_STATUSES) {
      expect(statusNextStep(status)).not.toMatch(banned);
    }
  });

  it("stays calm — no exclamation points, no urgency", () => {
    const shouty = /!|urgent|immediately|act now/i;
    for (const status of ALL_STATUSES) {
      expect(statusNextStep(status)).not.toMatch(shouty);
    }
  });
});
