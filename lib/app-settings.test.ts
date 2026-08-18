// lib/app-settings.test.ts
// B-13 Pieza 5: the tunable limits live in a DB table, not hardcoded. This
// module resolves a numeric setting from a raw row map, always with a safe
// code default so a missing/garbage/empty table can never break a caller.

import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS, resolveSetting, type SettingKey } from "./app-settings";

describe("app settings — defaults and resolution", () => {
  it("every known key has a positive numeric default", () => {
    (Object.keys(DEFAULT_SETTINGS) as SettingKey[]).forEach((k) => {
      expect(typeof DEFAULT_SETTINGS[k]).toBe("number");
      expect(DEFAULT_SETTINGS[k]).toBeGreaterThan(0);
    });
  });

  it("returns the DB value when present and valid", () => {
    expect(resolveSetting("chat_messages_per_day", { chat_messages_per_day: 500 })).toBe(500);
  });

  it("falls back to the default when the key is absent from the map", () => {
    expect(resolveSetting("chat_messages_per_day", {})).toBe(
      DEFAULT_SETTINGS.chat_messages_per_day
    );
  });

  it("falls back on a null, NaN, zero, or negative override (garbage-proof)", () => {
    const d = DEFAULT_SETTINGS.lookup_max_per_order_hour;
    expect(resolveSetting("lookup_max_per_order_hour", { lookup_max_per_order_hour: null as unknown as number })).toBe(d);
    expect(resolveSetting("lookup_max_per_order_hour", { lookup_max_per_order_hour: NaN })).toBe(d);
    expect(resolveSetting("lookup_max_per_order_hour", { lookup_max_per_order_hour: 0 })).toBe(d);
    expect(resolveSetting("lookup_max_per_order_hour", { lookup_max_per_order_hour: -3 })).toBe(d);
  });

  it("carries the agreed values as defaults", () => {
    expect(DEFAULT_SETTINGS.chat_messages_per_day).toBe(300);
    expect(DEFAULT_SETTINGS.chat_global_messages_per_day).toBe(20000);
    expect(DEFAULT_SETTINGS.chat_max_input_chars).toBe(1500);
    expect(DEFAULT_SETTINGS.chat_history_turns).toBe(20);
    expect(DEFAULT_SETTINGS.lookup_max_per_order_hour).toBe(5);
    expect(DEFAULT_SETTINGS.lookup_max_per_ip_15min).toBe(30);
    expect(DEFAULT_SETTINGS.intake_messages_per_hour).toBe(40);
    expect(DEFAULT_SETTINGS.intake_messages_global_per_hour).toBe(2000);
  });
});
