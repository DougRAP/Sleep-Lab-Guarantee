import { describe, it, expect, afterEach, vi } from "vitest";
import { isAuthConfigured } from "./config";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isAuthConfigured — the single switch for real auth", () => {
  it("is off with no Supabase env (production today)", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    expect(isAuthConfigured()).toBe(false);
  });

  it("is off with only half the keys — no partial auth", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    expect(isAuthConfigured()).toBe(false);

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    expect(isAuthConfigured()).toBe(false);
  });

  it("is on once the public Supabase keys are present", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    expect(isAuthConfigured()).toBe(true);
  });
});
