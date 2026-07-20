import { cn } from "../../lib/utils";

/**
 * The lab layer: a quiet mono label over one apricot numeral line. Used for the
 * RA and tracking numbers wherever they appear — the closing screen of the
 * fitting and the request detail — so the same number never changes register.
 */
export function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-mist">
        {label}
      </p>
      <p className="font-mono text-[22px] leading-none text-dawn">{value}</p>
    </div>
  );
}
