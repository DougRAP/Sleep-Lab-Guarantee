// lib/auth/footer-visitor.ts
// The server half of R-1: who is looking at the footer?
//
// `footerPlan()` in lib/shell.ts is pure and decides WHAT the bar offers. This
// resolves the three booleans it needs, against whichever authentication is
// actually live, so the rule never learns which one produced the answer:
//
//   Supabase configured -> the auth session, plus whether a purchase is linked.
//   Supabase absent     -> the light-verify cookie.
//
// `linked` must mean exactly what requireGuarantee() means by it, or the bar
// offers tabs the page then bounces. That is subtler than it looks on the
// light-verify path: the cookie is a signed claim about a guarantee id, not
// proof the row still exists, and app-session.ts:99 redirects to "/" when it
// does not resolve. A 7-day cookie outliving its row would otherwise get all
// three tabs, all of them bouncing. So both paths resolve the row.
//
// Server-only, and per-request cached like getViewer() (B-18 fix 4).

import { cache } from "react";
import { getRepository } from "../data";
import { getSession } from "../session";
import type { FooterVisitor } from "../shell";
import { isAuthConfigured } from "./config";
import { ownedGuarantees } from "./owned-guarantees";
import { isStaff } from "./routing";
import { getViewer } from "./user";

/** Nobody is looking, or nobody we can identify. */
const ANONYMOUS: FooterVisitor = {
  authenticated: false,
  linked: false,
  staff: false,
};

export const getFooterVisitor = cache(async (): Promise<FooterVisitor> => {
  try {
    if (!isAuthConfigured()) {
      const light = await getSession();
      if (!light) return ANONYMOUS;
      // Resolve the row, exactly as requireGuarantee() does.
      const guarantee = await getRepository().getGuaranteeById(light.guaranteeId);
      return guarantee
        ? { authenticated: true, linked: true, staff: false }
        : ANONYMOUS;
    }

    const viewer = await getViewer();
    if (!viewer) return ANONYMOUS;

    // Staff never reach the consumer tabs, so their linked state is irrelevant
    // and not worth a query.
    if (isStaff(viewer.role)) {
      return { authenticated: true, linked: false, staff: true };
    }

    const owned = await ownedGuarantees(viewer.userId);
    return { authenticated: true, linked: owned.length > 0, staff: false };
  } catch {
    // A footer must never be the reason a page fails to render. The cost of
    // this catch is that a repository outage quietly demotes a linked customer
    // to the support-only bar, which is the right way to fail: it offers them
    // a phone number instead of tabs that would not work either.
    return ANONYMOUS;
  }
});
