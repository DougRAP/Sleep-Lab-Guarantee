// lib/data/account-lookup.test.ts
// R-9: the repository's one account question, and the escaping that keeps it a
// QUESTION rather than a search.
//
// The address reaching this operation is typed into an anonymous form. It is
// never ours, it is never verified, and looksLikeEmail (lib/claim-flow.ts)
// rejects only whitespace and a second "@" — so "%" and "_" arrive intact.
// Handed straight to ILIKE those are wildcards, and "does THIS address have an
// account" quietly becomes "list me the addresses that have accounts". That is
// a wider disclosure than the one R-9 was weighed against, and the honest case
// breaks too: john_doe@x.com would match a stored johnXdoe@x.com and we would
// greet the wrong person.

import { describe, expect, it } from "vitest";
import { MemoryRepository } from "./memory-repository";
import { likeLiteral } from "./repository";

/** Every backslash-escaped pair removed, so what's left is what Postgres acts on. */
function live(pattern: string): string {
  return pattern.replace(/\\[\s\S]/g, "");
}

describe("likeLiteral — an address is a value, not a pattern", () => {
  it("leaves an ordinary address exactly as it was", () => {
    expect(likeLiteral("terri@rapqa.com")).toBe("terri@rapqa.com");
  });

  it("escapes the wildcards, so the query asks about one address", () => {
    // Both are legal in a local part, and "_" is common in real ones.
    expect(likeLiteral("john_doe@x.com")).toBe("john\\_doe@x.com");
    expect(likeLiteral("a%@b.com")).toBe("a\\%@b.com");
  });

  it("escapes the escape character first, not after", () => {
    // Backslash last would double-escape what the two rules after it just
    // wrote, turning an escaped wildcard back into a literal backslash
    // followed by a LIVE one — the exact bug this function exists to stop.
    expect(likeLiteral("a\\%@b.com")).toBe("a\\\\\\%@b.com");
    expect(live(likeLiteral("a\\%@b.com"))).toBe("a@b.com");
  });

  it("defuses the strings that turn the question into a listing", () => {
    for (const probe of ["%@%.%", "a%@%.%", "_@_._", "%@raptns.com"]) {
      expect(live(likeLiteral(probe))).not.toMatch(/[%_]/);
    }
  });
});

describe("MemoryRepository.accountExistsForEmail", () => {
  it("always says no, because without Supabase there are no accounts", async () => {
    // Not a stub standing in for a real answer: sign-up, sign-in and profiles
    // all belong to Supabase Auth, so with the in-memory backend nobody CAN
    // have an account to be recognised by. "No" is the truth here, not a
    // degradation — and isAuthConfigured() is false in this configuration too,
    // so the confirmation screen shows no invitation at all either way.
    const repo = new MemoryRepository();
    expect(await repo.accountExistsForEmail("terri@rapqa.com")).toBe(false);
    expect(await repo.accountExistsForEmail("")).toBe(false);
  });
});
