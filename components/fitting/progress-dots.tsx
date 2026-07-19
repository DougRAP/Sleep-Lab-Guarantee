import { cn } from "../../lib/utils";
import { FITTING_STEPS } from "../../lib/fitting";
import type { FittingStep } from "../../lib/types";

const CAPTURE_STEPS = FITTING_STEPS.filter((s) => s !== "submitted");

/**
 * Gentle progress dots (DESIGN.md "The fitting"). Deliberately NOT a progress
 * bar with a percentage or a count — the customer sees where they are, not how
 * much paperwork remains.
 */
export function ProgressDots({ step }: { step: FittingStep }) {
  const index = CAPTURE_STEPS.indexOf(step as (typeof CAPTURE_STEPS)[number]);
  return (
    <div
      className="flex items-center gap-1.5"
      role="img"
      aria-label={`Step ${Math.max(index, 0) + 1} of ${CAPTURE_STEPS.length}`}
    >
      {CAPTURE_STEPS.map((s, i) => (
        <span
          key={s}
          aria-hidden
          className={cn(
            "h-[5px] rounded-full transition-all duration-500",
            i === index ? "w-5 bg-dawn" : i < index ? "w-[5px] bg-dawn/50" : "w-[5px] bg-white/15"
          )}
        />
      ))}
    </div>
  );
}
