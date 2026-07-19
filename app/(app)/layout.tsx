import { BottomNav } from "../../components/nav/bottom-nav";

// Route group for the navigable consumer app (v2 expansion). Renders the
// persistent bottom nav beneath each page. The group folder "(app)" does NOT
// affect URLs — /tonight, /concierge, /guarantee, /requests, /shop stay exactly
// as they were. Focused flows (the fitting, entry/verify) live OUTSIDE this
// group so they render full-bleed with no nav.
export default function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <BottomNav />
    </>
  );
}
