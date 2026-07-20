// lib/dates.test.ts
// Plain-language dates. The interesting case is the date-only string: parsed as
// UTC midnight it would render as the day before in every Western timezone.

import { describe, expect, it } from "vitest";
import { formatDayMonth, formatPlainDate } from "./dates";

describe("formatDayMonth", () => {
  it("is month + day, no year — US ordering, a US-only guarantee", () => {
    expect(formatDayMonth(new Date(2026, 7, 16))).toBe("August 16");
  });

  it("does not pad the day", () => {
    expect(formatDayMonth(new Date(2026, 0, 5))).toBe("January 5");
  });
});

describe("formatPlainDate", () => {
  it("adds the year", () => {
    expect(formatPlainDate(new Date(2026, 7, 16))).toBe("August 16, 2026");
  });

  it("reads a date-only string as a local calendar date, never a day early", () => {
    expect(formatPlainDate("2026-08-16")).toBe("August 16, 2026");
    expect(formatPlainDate("2026-01-01")).toBe("January 1, 2026");
  });

  it("reads an instant in local terms", () => {
    const instant = new Date(2026, 7, 16, 9, 30);
    expect(formatPlainDate(instant.toISOString())).toBe("August 16, 2026");
  });
});
