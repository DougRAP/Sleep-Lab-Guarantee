import * as React from "react";

/**
 * A long-form field for the customer's own words.
 *
 * Lifted out of `components/fitting/intake-step.tsx` for R-8, where the v3
 * claim needed the same control: the fitting captured what was wrong with the
 * mattress and the v3 flow did not, so every request reached the agent as
 * ticked boxes. One control, both flows, so the two can never drift apart.
 *
 * `maxLength` is not decoration. Both write paths cap this text server-side,
 * and before R-8 that cap was invisible: a customer could type three pages,
 * press Back, and be shown all three pages back by the client while the record
 * held two thirds of it. Bounding the box means what they can see is what is
 * kept, and a long paste is cut where they can watch it happen.
 */
export function ProseField({
  label,
  hint,
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  maxLength?: number;
}) {
  // React.useId, like Field does. The old label-derived id put an apostrophe in
  // "what-you'd-rather-have", and two fields sharing a label on one page would
  // have shared an id: the second label would focus the first box and describe
  // it with the wrong hint, in silence.
  const id = React.useId();
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="block font-mono text-[11px] uppercase tracking-[0.12em] text-mist"
      >
        {label}
      </label>
      <textarea
        id={id}
        rows={4}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={`${id}-hint`}
        className="w-full rounded-xl border border-[var(--line)] bg-white/[0.04] px-4 py-3 text-[16px] leading-relaxed text-cloud outline-none transition-colors placeholder:text-mist/60 focus-visible:border-dawn/70 focus-visible:ring-2 focus-visible:ring-dawn/40"
      />
      <p id={`${id}-hint`} className="text-[13px] text-mist">
        {hint}
      </p>
    </div>
  );
}
