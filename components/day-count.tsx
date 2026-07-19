import { cn } from "../lib/utils";

export function DayCount({
  day,
  total = 90,
  className,
}: {
  day: number;
  total?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-mono text-[13px] tracking-[0.06em] text-dawn",
        className
      )}
    >
      DAY {day} / {total}
    </span>
  );
}
