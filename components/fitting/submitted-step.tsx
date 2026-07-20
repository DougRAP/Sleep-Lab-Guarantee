import Link from "next/link";
import { ConciergeCard } from "../concierge-card";
import { FrostedCard } from "../ui/frosted-card";
import { Stat } from "../ui/stat";
import { buttonVariants } from "../ui/button";
import { cn } from "../../lib/utils";

/**
 * The closing screen. The RA and tracking number are the only "lab layer"
 * numerals here — set in mono, quiet, never presented as a ticket. No
 * congratulation, no confetti; the guide simply tells them it's handed over.
 */
export function SubmittedStep({
  raNumber,
  trackingNumber,
  dealerName,
}: {
  raNumber: string;
  trackingNumber: string;
  dealerName: string | null;
}) {
  return (
    <div className="space-y-6">
      <ConciergeCard>
        That&apos;s everything. Your return authorization is written up and shared
        with {dealerName ?? "your dealer"} — they&apos;ll take it from here, and
        you can follow along whenever you like.
      </ConciergeCard>

      <FrostedCard className="animate-settle space-y-4">
        <Stat label="Return authorization" value={raNumber} />
        <div className="border-t border-[var(--line)] pt-4">
          <Stat label="Tracking number" value={trackingNumber} />
        </div>
      </FrostedCard>

      <p className="text-[14px] leading-relaxed text-mist">
        Both sleep partners should be there in-store to choose the replacement
        together. Bring the mattress in its like-new condition, with the tags
        attached.
      </p>

      <Link href="/requests" className={cn(buttonVariants({ variant: "primary", size: "lg" }))}>
        Follow your request
      </Link>

      <Link
        href="/tonight"
        className="block text-center font-mono text-[11px] uppercase tracking-[0.12em] text-mist transition-colors hover:text-cloud"
      >
        Back to tonight
      </Link>
    </div>
  );
}
