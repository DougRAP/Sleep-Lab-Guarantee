// lib/consumer-language.test.ts
// v3 (M-S3): CG###### is the single customer reference. Submit no longer mints
// an RA or a tracking number (M-S1), so no consumer-facing exchange surface may
// still speak that language — a stale "Return authorization" stat would show an
// empty value and promise a document that is now a manual admin action.
//
// These are spec tests over the source, like lib/security-schema.test.ts: the
// screens themselves are React, so what is asserted here is the copy and the
// props they are built from. The legacy request detail (app/(app)/requests/[id])
// is deliberately NOT in scope — pre-v3 rows carry a real RA and no claim
// number, and hiding it would leave those customers with no reference at all.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const read = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), "utf8");

const submittedStep = read("components", "fitting", "submitted-step.tsx");
const fittingFlow = read("components", "fitting", "fitting-flow.tsx");
const verifyStep = read("components", "fitting", "verify-step.tsx");
const fittingPage = read("app", "fitting", "page.tsx");
const fittingAction = read("lib", "actions", "fitting.ts");

/** Customer-visible RA/tracking language, ignoring the Tailwind `tracking-` utilities. */
const RA_LANGUAGE = /return authorization|tracking number|\bra number\b/i;

describe("the fitting's closing screen leads with the claim number", () => {
  it("shows the CG number and says what it is for", () => {
    expect(submittedStep).toMatch(/claimNumber/);
    expect(submittedStep).toMatch(/claim number/i);
  });

  it("no longer shows an RA or a tracking number", () => {
    expect(RA_LANGUAGE.test(submittedStep.replace(/^\s*\*.*$/gm, ""))).toBe(false);
    expect(submittedStep).not.toMatch(/raNumber|trackingNumber/);
  });
});

describe("nothing upstream of that screen still carries RA/tracking props", () => {
  it("the flow, the verify step and the page pass a claim number", () => {
    for (const source of [fittingFlow, verifyStep, fittingPage]) {
      expect(source).toMatch(/claimNumber/);
      expect(source).not.toMatch(/raNumber|trackingNumber/);
    }
  });

  it("submitFitting returns the claim number and mints nothing else", () => {
    expect(fittingAction).toMatch(/claimNumber: result\.claimNumber/);
    expect(fittingAction).not.toMatch(/raNumber:|trackingNumber:/);
  });
});
