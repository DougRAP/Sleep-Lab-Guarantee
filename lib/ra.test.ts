// lib/ra.test.ts
// RA + tracking number generation. These get read aloud to dealers, so the
// format and the excluded glyphs are part of the contract.

import { describe, expect, it } from "vitest";
import {
  generateRaNumber,
  generateTrackingNumber,
  isRaNumber,
  isTrackingNumber,
} from "./ra";

/** Deterministic "random" walking the alphabet. */
function sequence(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("generateRaNumber", () => {
  it("carries the date and a four-character suffix", () => {
    const ra = generateRaNumber(new Date(2026, 6, 19), sequence([0]));
    expect(ra).toBe("RA-260719-2222");
    expect(isRaNumber(ra)).toBe(true);
  });

  it("pads single-digit months and days", () => {
    expect(generateRaNumber(new Date(2026, 0, 5), sequence([0]))).toBe("RA-260105-2222");
  });

  it("is deterministic for a given random source", () => {
    const a = generateRaNumber(new Date(2026, 6, 19), sequence([0.5]));
    const b = generateRaNumber(new Date(2026, 6, 19), sequence([0.5]));
    expect(a).toBe(b);
  });

  it("varies across calls with real randomness", () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateRaNumber()));
    expect(seen.size).toBeGreaterThan(150);
  });

  it("always matches the RA format", () => {
    for (let i = 0; i < 200; i++) expect(isRaNumber(generateRaNumber())).toBe(true);
  });
});

describe("generateTrackingNumber", () => {
  it("is an eight-character RAP code", () => {
    const tracking = generateTrackingNumber(sequence([0]));
    expect(tracking).toBe("RAP-22222222");
    expect(isTrackingNumber(tracking)).toBe(true);
  });

  it("always matches the tracking format", () => {
    for (let i = 0; i < 200; i++) {
      expect(isTrackingNumber(generateTrackingNumber())).toBe(true);
    }
  });

  it("is unique enough to hand out", () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateTrackingNumber()));
    expect(seen.size).toBe(500);
  });
});

describe("the spoken alphabet", () => {
  it("excludes glyphs that get confused over the phone (I, O, U, 0, 1)", () => {
    const codes = Array.from({ length: 300 }, () => generateRaNumber() + generateTrackingNumber());
    const suffixes = codes.map((c) => c.replace(/RA-\d{6}-/, "").replace("RAP-", ""));
    for (const s of suffixes) {
      expect(s).not.toMatch(/[IOU01]/);
    }
  });

  it("rejects malformed values", () => {
    expect(isRaNumber("RA-2607-2222")).toBe(false);
    expect(isRaNumber("RAP-22222222")).toBe(false);
    expect(isTrackingNumber("RAP-2222")).toBe(false);
    expect(isTrackingNumber("RA-260719-2222")).toBe(false);
  });
});
