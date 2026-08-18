// content/support.ts
// How a customer reaches a person (v3 spec §1, §2.1). One place, so the
// landing page, the confirmation screen, and anything else that says "call or
// email us" can never drift apart.

/** PLACEHOLDER — Doug supplies the real number before launch (spec §7 #2). */
export const SUPPORT_PHONE = "(800) 111-1110";

/**
 * Doug specified comfort@raptns.com for the app (2026-08-18); the guarantee
 * document says claims@raptns.com — flagged in the spec, Doug's copy wins
 * until he says otherwise.
 */
export const SUPPORT_EMAIL = "comfort@raptns.com";
