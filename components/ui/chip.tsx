import * as React from "react";
import { cn } from "../../lib/utils";

export interface ChipProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
}

export function Chip({ className, selected, ...props }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "rounded-full border px-4 py-2.5 text-sm transition-colors",
        selected
          ? "border-transparent bg-dawn text-[#241a12]"
          : "border-[var(--line)] bg-white/[0.03] text-cloud hover:bg-white/[0.06]",
        className
      )}
      {...props}
    />
  );
}
