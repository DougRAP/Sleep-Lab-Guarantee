import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const button = cva(
  "inline-flex items-center justify-center gap-2 rounded-2xl font-medium transition-[filter,background-color,color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dawn/60 focus-visible:ring-offset-2 focus-visible:ring-offset-night disabled:opacity-45 disabled:pointer-events-none select-none",
  {
    variants: {
      variant: {
        primary:
          "bg-gradient-to-b from-dawn to-dawn-deep text-[#241a12] shadow-[0_10px_34px_rgba(233,179,132,0.16)] hover:brightness-[1.05] active:brightness-95",
        ghost:
          "border border-[var(--line)] bg-white/[0.03] text-cloud hover:bg-white/[0.06]",
        quiet: "text-mist hover:text-cloud",
      },
      size: {
        lg: "h-[52px] w-full px-6 text-[15px]",
        md: "h-11 px-5 text-sm",
        sm: "h-9 px-4 text-[13px]",
      },
    },
    defaultVariants: { variant: "primary", size: "lg" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button className={cn(button({ variant, size }), className)} {...props} />
  );
}

export { button as buttonVariants };
