import { isDemoMode } from "../../lib/demo";
import { getDemoDay } from "../../lib/demo-server";
import { DayJumper } from "./day-jumper";

/**
 * Server-side gate for the demo day-jumper. Renders nothing at all unless
 * NEXT_PUBLIC_DEMO_MODE is on, so switching the env off removes the control
 * from the tree entirely (no client bundle, no markup).
 */
export async function DemoControls({ aboveNav = false }: { aboveNav?: boolean }) {
  if (!isDemoMode()) return null;
  return <DayJumper day={await getDemoDay()} aboveNav={aboveNav} />;
}
