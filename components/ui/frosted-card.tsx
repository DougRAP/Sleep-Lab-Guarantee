import * as React from "react";
import { cn } from "../../lib/utils";

export function FrostedCard({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[20px] border border-[var(--line)] bg-surface2/60 p-[18px] backdrop-blur-xl",
        className
      )}
      {...props}
    />
  );
}
