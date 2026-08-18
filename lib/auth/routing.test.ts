import { afterEach, describe, it, expect, vi } from "vitest";
import {
  ADMIN_PATH,
  CLAIMS_HOME_PATH,
  ENTRY_PATH,
  HOME_PATH,
  LOGIN_PATH,
  REQUESTS_PATH,
  guardAdminRoute,
  guardAppRoute,
  guardAuthRoute,
  guardLinkRoute,
  homePath,
  routeAfterAuth,
  type ViewerState,
} from "./routing";

/** Supabase configured, nobody signed in. */
function state(overrides: Partial<ViewerState> = {}): ViewerState {
  return {
    authConfigured: true,
    authenticated: false,
    linked: false,
    role: null,
    hasLightSession: false,
    ...overrides,
  };
}

describe("app routes are closed to anyone who isn't signed in", () => {
  it("sends an unauthenticated visitor to log in", () => {
    expect(guardAppRoute(state())).toBe(LOGIN_PATH);
  });

  it("does not care that a light-verify cookie exists once real auth is on", () => {
    // The old signed cookie must not be a way past real authentication.
    expect(guardAppRoute(state({ hasLightSession: true }))).toBe(LOGIN_PATH);
  });

  it("routes an authenticated consumer with no purchase to the tracking list (v3 M-S5)", () => {
    expect(guardAppRoute(state({ authenticated: true, role: "consumer" }))).toBe(
      REQUESTS_PATH
    );
  });

  it("lets an authenticated, linked consumer through", () => {
    expect(
      guardAppRoute(state({ authenticated: true, linked: true, role: "consumer" }))
    ).toBeNull();
  });

  it("sends staff without a purchase to admin, not the link step", () => {
    expect(guardAppRoute(state({ authenticated: true, role: "rap_admin" }))).toBe(
      ADMIN_PATH
    );
  });
});

describe("/admin is gated by role", () => {
  it("sends an unauthenticated visitor to log in", () => {
    expect(guardAdminRoute(state())).toBe(LOGIN_PATH);
  });

  it("admits rap_admin", () => {
    expect(guardAdminRoute(state({ authenticated: true, role: "rap_admin" }))).toBeNull();
  });

  it("admits a dealer", () => {
    expect(guardAdminRoute(state({ authenticated: true, role: "dealer" }))).toBeNull();
  });

  it("turns a consumer away calmly, to somewhere useful", () => {
    expect(
      guardAdminRoute(state({ authenticated: true, linked: true, role: "consumer" }))
    ).toBe(HOME_PATH);
    expect(guardAdminRoute(state({ authenticated: true, role: "consumer" }))).toBe(
      REQUESTS_PATH
    );
  });

  it("treats a missing role as a consumer, never as staff", () => {
    expect(guardAdminRoute(state({ authenticated: true, role: null }))).toBe(
      REQUESTS_PATH
    );
  });
});

describe("the link step", () => {
  it("requires an account first — it is not the login", () => {
    expect(guardLinkRoute(state())).toBe(LOGIN_PATH);
  });

  it("is skipped once a purchase is linked", () => {
    expect(guardLinkRoute(state({ authenticated: true, linked: true }))).toBe(HOME_PATH);
  });

  it("is shown to an authenticated consumer with nothing linked", () => {
    expect(guardLinkRoute(state({ authenticated: true, role: "consumer" }))).toBeNull();
  });
});

describe("where authentication lands you", () => {
  it("a linked consumer goes straight to tonight", () => {
    expect(
      routeAfterAuth(state({ authenticated: true, linked: true, role: "consumer" }))
    ).toBe(HOME_PATH);
  });

  it("an unlinked consumer goes to the tracking list — never a /link bounce (v3 M-S5)", () => {
    expect(routeAfterAuth(state({ authenticated: true, role: "consumer" }))).toBe(
      REQUESTS_PATH
    );
  });

  it("staff go to admin", () => {
    expect(routeAfterAuth(state({ authenticated: true, role: "rap_admin" }))).toBe(
      ADMIN_PATH
    );
    expect(routeAfterAuth(state({ authenticated: true, role: "dealer" }))).toBe(
      ADMIN_PATH
    );
  });

  it("keeps an already-signed-in visitor off the login/signup screens", () => {
    expect(
      guardAuthRoute(state({ authenticated: true, linked: true, role: "consumer" }))
    ).toBe(HOME_PATH);
    expect(guardAuthRoute(state())).toBeNull();
  });
});

describe("fallback when Supabase is NOT configured", () => {
  const unconfigured = (o: Partial<ViewerState> = {}) =>
    state({ authConfigured: false, ...o });

  it("falls back to the light-verify cookie for app routes", () => {
    expect(guardAppRoute(unconfigured({ hasLightSession: true }))).toBeNull();
    expect(guardAppRoute(unconfigured({ hasLightSession: false }))).toBe(ENTRY_PATH);
  });

  it("hides the account routes, which cannot work without Supabase", () => {
    expect(guardAuthRoute(unconfigured())).toBe(ENTRY_PATH);
    expect(guardLinkRoute(unconfigured())).toBe(ENTRY_PATH);
    expect(routeAfterAuth(unconfigured())).toBe(ENTRY_PATH);
  });

  it("lets /admin render its own calm 'not switched on' state instead of looping", () => {
    // Redirecting to a login that cannot work would be a dead end.
    expect(guardAdminRoute(unconfigured())).toBeNull();
  });
});

describe("claims mode moves home from /tonight to /guarantee", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("homePath is /tonight normally and /guarantee in claims mode", () => {
    expect(homePath(false)).toBe(HOME_PATH);
    expect(homePath(true)).toBe(CLAIMS_HOME_PATH);
  });

  it("reads the env-backed default: off unless exactly 'true'", () => {
    expect(homePath()).toBe(HOME_PATH);
    vi.stubEnv("NEXT_PUBLIC_CLAIMS_MODE", "true");
    expect(homePath()).toBe(CLAIMS_HOME_PATH);
  });

  it("lands a linked consumer on the guarantee after authentication", () => {
    vi.stubEnv("NEXT_PUBLIC_CLAIMS_MODE", "true");
    expect(
      routeAfterAuth(state({ authenticated: true, linked: true, role: "consumer" }))
    ).toBe(CLAIMS_HOME_PATH);
  });

  it("skips the link step to the guarantee once a purchase is linked", () => {
    vi.stubEnv("NEXT_PUBLIC_CLAIMS_MODE", "true");
    expect(guardLinkRoute(state({ authenticated: true, linked: true }))).toBe(
      CLAIMS_HOME_PATH
    );
  });

  it("still routes the unlinked and staff exactly as before", () => {
    vi.stubEnv("NEXT_PUBLIC_CLAIMS_MODE", "true");
    expect(routeAfterAuth(state({ authenticated: true, role: "consumer" }))).toBe(
      REQUESTS_PATH
    );
    expect(routeAfterAuth(state({ authenticated: true, role: "rap_admin" }))).toBe(
      ADMIN_PATH
    );
  });
});
