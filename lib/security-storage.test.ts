// lib/security-storage.test.ts
// P0 (audit 2026-07-28) — the claim-photos bucket (mattress photos + receipts,
// i.e. customer PII) must be declared PRIVATE in version control, not left to a
// manual dashboard toggle that can silently drift to public. It also gets
// owner/dealer/admin storage policies as defense in depth (today access is only
// via service-role uploads + short-lived signed URLs).
//
// This spec scans the checked-in SQL (schema + migrations). It fails if the
// bucket is ever declared public, or if the private declaration / owner policy
// disappears.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const dir = join(process.cwd(), "supabase");
const files = [
  join(dir, "schema.sql"),
  ...readdirSync(join(dir, "migrations")).map((f) => join(dir, "migrations", f)),
];
const sql = files.map((f) => readFileSync(f, "utf8")).join("\n").toLowerCase();

describe("storage — claim-photos bucket is versioned and private (audit 2026-07-28)", () => {
  it("declares the claim-photos bucket as private (public = false)", () => {
    // An insert into storage.buckets for claim-photos with public = false.
    expect(sql).toMatch(
      /insert\s+into\s+storage\.buckets[\s\S]*?claim-photos[\s\S]*?false/
    );
  });

  it("never declares the bucket public", () => {
    expect(sql).not.toMatch(/'claim-photos'\s*,\s*'claim-photos'\s*,\s*true/);
    expect(sql).not.toMatch(/set\s+public\s*=\s*true/);
  });

  it("scopes storage access to the claim owner / dealer / admin", () => {
    // A storage.objects policy for the bucket, tied to the claim's owner.
    expect(sql).toMatch(/create\s+policy[\s\S]*?storage\.objects/);
    expect(sql).toMatch(/storage\.foldername/);
    expect(sql).toMatch(/claim-photos[\s\S]*?consumer_id\s*=\s*auth\.uid\(\)/);
  });
});
