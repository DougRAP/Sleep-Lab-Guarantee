import * as React from "react";
import { FrostedCard } from "./ui/frosted-card";
import { cn } from "../lib/utils";

/** The guide speaks in the serif voice, on a frosted card that settles in. */
export function ConciergeCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <FrostedCard className={cn("animate-settle", className)}>
      <p className="font-serif text-[19px] leading-[1.35] tracking-[-0.01em] text-cloud">
        {children}
      </p>
    </FrostedCard>
  );
}
