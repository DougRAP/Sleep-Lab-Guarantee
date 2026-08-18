// lib/app-settings.ts
// B-13 Pieza 5: the operational limits are TUNABLE from a DB table (app_settings),
// so raising "300 messages" to "500" is an UPDATE, not a deploy. No UI yet — that
// comes later. Every key has a safe code DEFAULT: if the table is missing, empty,
// or holds garbage, callers still get a sane number and nothing breaks.

/** The tunable knobs. Numeric only, positive only. */
export type SettingKey =
  | "chat_messages_per_day"
  | "chat_global_messages_per_day"
  | "chat_max_input_chars"
  | "chat_history_turns"
  | "lookup_max_per_order_hour"
  | "lookup_max_per_ip_15min"
  | "intake_messages_per_hour"
  | "intake_messages_global_per_hour";

/**
 * Defaults, agreed in the B-13 definition (2026-07-24). These are the source of
 * truth until a row overrides them; they also seed app_settings.
 *  - chat_messages_per_day 300: ~3x the most extreme human night (~120), so no
 *    real customer is ever throttled; a script is capped at pennies/day.
 *  - chat_global_messages_per_day 20000: ~$50/day program-wide fuse.
 *  - chat_max_input_chars 1500 / chat_history_turns 20: bound the per-reply cost.
 *  - lookup 5/order/hour + 30/ip/15min: throttle order+lastname guessing.
 *  - intake_messages_per_hour 40 (audit 2026-07-28): the fitting intake also
 *    calls the model; an honest intake is a handful of turns, so 40/hour is
 *    generous headroom for a person while capping a script to pennies.
 *  - intake_messages_global_per_hour 2000: a program-wide fuse for the intake,
 *    mirroring the chat's global cap, so a distributed caller can't bypass the
 *    per-guarantee limit by spreading across many guarantees. No realistic
 *    legitimate volume reaches it; it caps a runaway/script.
 */
export const DEFAULT_SETTINGS: Record<SettingKey, number> = {
  chat_messages_per_day: 300,
  chat_global_messages_per_day: 20000,
  chat_max_input_chars: 1500,
  chat_history_turns: 20,
  lookup_max_per_order_hour: 5,
  lookup_max_per_ip_15min: 30,
  intake_messages_per_hour: 40,
  intake_messages_global_per_hour: 2000,
};

/** A raw key→value map as read from the table (values may be anything). */
export type SettingsMap = Partial<Record<SettingKey, number | null | undefined>>;

/**
 * Resolve one setting: the DB value if it is a finite positive number, else the
 * code default. Garbage (null, NaN, zero, negative) always falls back, so a bad
 * row can never disable a limit or crash a caller.
 */
export function resolveSetting(key: SettingKey, map: SettingsMap): number {
  const v = map[key];
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  return DEFAULT_SETTINGS[key];
}
