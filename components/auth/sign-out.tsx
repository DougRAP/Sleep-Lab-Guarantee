"use client";

import { useTransition } from "react";
import { signOutAction } from "../../lib/actions/auth";
import { cn } from "../../lib/utils";

/**
 * A quiet way out. Uses the same mono/uppercase whisper as the existing "‹
 * Tonight" back link — an affordance, not a button, so it never competes with
 * the one primary action on the screen.
 */
export function SignOut({ className }: { className?: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => void signOutAction())}
      className={cn(
        "font-mono text-[11px] uppercase tracking-[0.12em] text-mist transition-colors hover:text-cloud disabled:opacity-45",
        className
      )}
    >
      Sign out
    </button>
  );
}
