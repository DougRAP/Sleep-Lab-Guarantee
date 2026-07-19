import { cn } from "../lib/utils";

export function Logo({
  className = "",
  showText = true,
  size = 34,
}: {
  className?: string;
  showText?: boolean;
  size?: number;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icon.svg"
        width={size}
        height={size}
        alt=""
        className="rounded-[9px] flex-shrink-0"
      />
      {showText && (
        <span className="font-serif text-[17px] leading-none tracking-tight text-cloud">
          RAP Sleep <span className="italic text-dawn">Lab</span>
        </span>
      )}
    </div>
  );
}
