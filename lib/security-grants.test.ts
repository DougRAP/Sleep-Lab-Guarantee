// lib/security-grants.test.ts
// P0 (audit 2026-07-28) — explicit Data API grants. Supabase is removing the
// implicit grant on public.* (enforced 2026-10-30). Until fixed, anon and
// authenticated held implicit CRUD on the base tables, gated only by RLS, and
// after enforcement the service-role app would keep working but the posture is
// undocumented. This pins the strict regime from the account's CLAUDE.md:
// future tables are revoked from anon/authenticated by default, service_role
// gets explicit CRUD, and every existing table/view is revoked from anon.
//
// The app only ever touches tables through the service-role client (the anon
// client is used solely for supabase.auth.*), so revoking anon/authenticated on
// public breaks nothing — it just makes the deny explicit.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const dir = join(process.cwd(), "supabase");
const files = [
  join(dir, "schema.sql"),
  ...readdirSync(join(dir, "migrations")).map((f) => join(dir, "migrations", f)),
];
const sql = files.map((f) => readFileSync(f, "utf8")).join("\n").toLowerCase();

describe("Data API grants — explicit, strict regime (audit 2026-07-28)", () => {
  it("sets a strict default that revokes future tables from anon and authenticated", () => {
    expect(sql).toMatch(
      /alter default privileges in schema public[\s\S]*?revoke all on tables from[^;]*anon/
    );
    expect(sql).toMatch(
      /alter default privileges in schema public[\s\S]*?revoke all on tables from[^;]*authenticated/
    );
  });

  it("grants future tables to service_role by default (backend stays reachable)", () => {
    expect(sql).toMatch(
      /alter default privileges in schema public[\s\S]*?grant[^;]*on tables to[^;]*service_role/
    );
  });

  it("revokes every existing public object from anon and grants service_role", () => {
    // The retrofit loop over existing tables/views.
    expect(sql).toMatch(/revoke all on public\.%i from anon/);
    expect(sql).toMatch(/grant[^;]*on public\.%i to service_role/);
  });
});
