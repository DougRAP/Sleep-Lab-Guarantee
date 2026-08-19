// components/nav/app-footer.tsx
// R-1: the footer as a property of the app, not of the app/(app) route group.
//
// The root layout has no pathname (server components never do), so the surface
// rule stays inside BottomNav, which already reads usePathname(). What the root
// CAN do is resolve who is looking, which a client component cannot. That split
// is the whole reason this thin server wrapper exists.

import { BottomNav } from "./bottom-nav";
import { getFooterVisitor } from "../../lib/auth/footer-visitor";

export async function AppFooter() {
  return <BottomNav visitor={await getFooterVisitor()} />;
}
