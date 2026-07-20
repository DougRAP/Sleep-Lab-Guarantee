import { describe, it, expect } from "vitest";
import {
  ADMIN_PATH,
  ENTRY_PATH,
  HOME_PATH,
  LINK_PATH,
  LOGIN_PATH,
  guardAdminRoute,
  guardAppRoute,
  guardAuthRoute,
  guardLinkRoute,
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

  it("routes an authenticated consumer with no purchase to the link step", () => {
    expect(guardAppRoute(state({ authenticated: true, role: "consumer" }))).toBe(
      LINK_PATH
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
      LINK_PATH
    );
  });

  it("treats a missing role as a consumer, never as staff", () => {
    expect(guardAdminRoute(state({ authenticated: true, role: null }))).toBe(LINK_PATH);
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

  it("an unlinked consumer goes to the link step", () => {
    expect(routeAfterAuth(state({ authenticated: true, role: "consumer" }))).toBe(
      LINK_PATH
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
