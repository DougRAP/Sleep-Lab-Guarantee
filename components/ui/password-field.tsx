"use client";

import * as React from "react";
import { Field } from "./field";

function EyeIcon({ off, className }: { off?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M4 20 20 4" />}
    </svg>
  );
}

type PasswordFieldProps = Omit<React.ComponentProps<typeof Field>, "type">;

/**
 * A password Field with a view/hide toggle (Emmy's list, 2026-07-23:
 * "add view password on the login page"). Same Field underneath — the eye
 * simply flips the input type, so autofill, hints and errors are untouched.
 * The button is type="button" and stays out of the tab-submit flow.
 */
export function PasswordField(props: PasswordFieldProps) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="relative">
      <Field {...props} type={visible ? "text" : "password"} className="pr-12" />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute right-3 top-[34px] text-mist transition-colors hover:text-cloud"
      >
        <EyeIcon off={visible} className="h-5 w-5" />
      </button>
    </div>
  );
}
