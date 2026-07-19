import * as React from "react";
import { cn } from "../../lib/utils";

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

/** Accessible labeled input: bound label, described-by hint/error, aria-invalid. */
export const Field = React.forwardRef<HTMLInputElement, FieldProps>(
  function Field({ label, hint, error, id, className, ...props }, ref) {
    const reactId = React.useId();
    const inputId = id || reactId;
    const hintId = hint ? `${inputId}-hint` : undefined;
    const errId = error ? `${inputId}-err` : undefined;
    return (
      <div className="space-y-1.5">
        <label
          htmlFor={inputId}
          className="block font-mono text-[11px] uppercase tracking-[0.12em] text-mist"
        >
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          aria-describedby={[hintId, errId].filter(Boolean).join(" ") || undefined}
          aria-invalid={error ? true : undefined}
          className={cn(
            "h-12 w-full rounded-xl border bg-white/[0.04] px-4 text-[15px] text-cloud outline-none transition-colors placeholder:text-mist/60 focus-visible:border-dawn/70 focus-visible:ring-2 focus-visible:ring-dawn/40",
            error ? "border-dawn/70" : "border-[var(--line)]",
            className
          )}
          {...props}
        />
        {hint && !error && (
          <p id={hintId} className="text-[13px] text-mist">
            {hint}
          </p>
        )}
        {error && (
          <p id={errId} className="text-[13px] text-dawn">
            {error}
          </p>
        )}
      </div>
    );
  }
);
