// lib/security-schema.test.ts
// P0 (audit 2026-07-28) — privilege-escalation guard on the SQL schema itself.
// The finding: profiles_self_update was `for update using (id = auth.uid())`
// with NO `with check`, so an authenticated user could PATCH their own row and
// set role='rap_admin' straight through PostgREST. This spec test fails if any
// write policy ships without a WITH CHECK, and specifically if the profiles
// self-update policy stops freezing the role column.
//
// It reads the checked-in schema (the source of truth); the matching migration
// applies the same DDL to the live database.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const schema = readFileSync(join(process.cwd(), "supabase", "schema.sql"), "utf8");
const policies = schema.match(/create policy[\s\S]*?;/gi) ?? [];

describe("RLS schema — no write policy without WITH CHECK (audit 2026-07-28)", () => {
  it("finds the policies in the schema", () => {
    expect(policies.length).toBeGreaterThan(0);
  });

  it("every UPDATE/ALL policy constrains the new row with WITH CHECK", () => {
    const writePolicies = policies.filter((p) => /\bfor\s+(update|all)\b/i.test(p));
    expect(writePolicies.length).toBeGreaterThan(0);
    for (const p of writePolicies) {
      const name = (p.match(/create policy\s+"?([a-z0-9_]+)"?/i)?.[1] ?? "?");
      expect(/with\s+check/i.test(p), `policy "${name}" has no WITH CHECK`).toBe(true);
    }
  });

  it("profiles_self_update freezes the role column (no self-promotion)", () => {
    const selfUpdate = policies.find((p) => /profiles_self_update/i.test(p));
    expect(selfUpdate, "profiles_self_update policy is missing").toBeTruthy();
    expect(/with\s+check/i.test(selfUpdate!)).toBe(true);
    // The WITH CHECK must pin role (and dealer scope) so they can't be changed.
    expect(/with\s+check[\s\S]*\brole\b/i.test(selfUpdate!)).toBe(true);
    expect(/with\s+check[\s\S]*dealer_location_id/i.test(selfUpdate!)).toBe(true);
  });
});
