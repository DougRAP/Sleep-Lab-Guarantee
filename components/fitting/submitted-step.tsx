import Link from "next/link";
import { ConciergeCard } from "../concierge-card";
import { FrostedCard } from "../ui/frosted-card";
import { Stat } from "../ui/stat";
import { buttonVariants } from "../ui/button";
import { homePath } from "../../lib/auth/routing";
import { isClaimsMode } from "../../lib/demo";
import { cn } from "../../lib/utils";

/**
 * The closing screen. v3 (M-S3): the CG claim number is the single customer
 * reference — submit no longer mints an RA or a tracking number, and no
 * consumer surface speaks that language. The number is the only "lab layer"
 * numeral here, set in mono, quiet, never presented as a ticket. No
 * congratulation, no confetti; the guide simply tells them it's handed over.
 */
export function SubmittedStep({
  claimNumber,
  dealerName,
}: {
  claimNumber: string;
  dealerName: string | null;
}) {
  return (
    <div className="space-y-6">
      <ConciergeCard>
        That&apos;s everything. Your request is with us and shared with{" "}
        {dealerName ?? "your dealer"} — we&apos;ll take it from here, and you
        can follow along whenever you like.
      </ConciergeCard>

      <FrostedCard className="animate-settle space-y-4">
        <Stat label="Your claim number" value={claimNumber} />
        <p className="text-[13px] leading-relaxed text-mist">
          Save this number — it&apos;s how we&apos;ll both refer to your request
          from here. Have it handy if you call or email.
        </p>
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
        href={homePath()}
        className="block text-center font-mono text-[11px] uppercase tracking-[0.12em] text-mist transition-colors hover:text-cloud"
      >
        {isClaimsMode() ? "Back to your guarantee" : "Back to tonight"}
      </Link>
    </div>
  );
}
