import * as React from "react";
import { Button } from "./button";

/**
 * The pair of controls that closes every screen of a step flow: go back, and go
 * on. One component so the two wizards (/claim and /fitting) cannot drift apart
 * in shape, wording or order.
 *
 * R-2 first shipped Back as a single control in the footer's leading cell.
 * Adrian, 2026-08-20: it belongs in the form, beside Next, on every step, the
 * way a wizard reads. The footer went back to carrying only tabs and support.
 *
 * Back is the ghost variant and takes the narrower third: it is the escape, not
 * the invitation, and the eye should land on the primary first (DESIGN.md,
 * "exactly one primary action"). With no `onBack` the step renders its own
 * button alone and the markup is unchanged from before.
 */
export function StepActions({
  onBack,
  backLabel = "Back to the previous step",
  children,
}: {
  /** Absent on a screen with nowhere to go back to. */
  onBack?: () => void;
  /** What assistive tech announces, since the visible word is just "Back". */
  backLabel?: string;
  /** The step's own primary button. */
  children: React.ReactNode;
}) {
  if (!onBack) return <>{children}</>;
  return (
    <div className="flex gap-3">
      <Button
        variant="ghost"
        onClick={onBack}
        aria-label={backLabel}
        className="basis-1/3"
      >
        {/* Decorative: the chevron is not part of the name read aloud. */}
        <span aria-hidden>&lsaquo;&nbsp;</span>Back
      </Button>
      <div className="basis-2/3">{children}</div>
    </div>
  );
}
