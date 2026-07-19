/**
 * "Still needed" — the fitting's only form of incompleteness.
 *
 * Not validation: no red, no asterisks, no error role. It is the guide quietly
 * naming what is left, in the serif voice, and it is only ever additive.
 */
export function StillNeeded({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div aria-live="polite" className="space-y-1.5">
      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-mist">
        Still needed
      </p>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-[14px] leading-snug text-mist">
            <span aria-hidden className="mt-[1px] text-mist/60">
              &middot;
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
