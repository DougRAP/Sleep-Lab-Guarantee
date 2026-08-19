// Route group for the navigable consumer app (v2 expansion). The group folder
// "(app)" does NOT affect URLs — /tonight, /concierge, /guarantee, /requests,
// /shop stay exactly as they were.
//
// R-1 (Doug, 2026-08-19): the bottom nav and the demo controls moved UP to the
// root layout, so every surface has chrome underfoot and not just this folder.
// The group stays as a grouping; it is no longer what decides whether the bar
// appears. That decision now lives in footerPlan() (lib/shell.ts).
export default function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
