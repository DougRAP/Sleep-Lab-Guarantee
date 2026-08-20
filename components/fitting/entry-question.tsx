"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ConciergeCard } from "../concierge-card";
import { Button, buttonVariants } from "../ui/button";
import { cn } from "../../lib/utils";
import { entryCopy, type EntryPrompt } from "../../lib/fitting";

/**
 * R-5: the fitting asks before it assumes.
 *
 * Doug, on the call: "we should ask, is this a new claim or an existing one?"
 * Until now the page answered for the customer, resuming an open draft without
 * saying so and otherwise starting fresh in silence.
 *
 * The answer never reaches the server. No route, no query parameter (a choice
 * in the URL is a choice someone can forge or bookmark into the wrong state),
 * and no write: merely being asked must leave no trace, because the draft is
 * born lazily inside the first server action (Emmy's ghost fix, 2026-07-23).
 *
 * It IS remembered for the sitting, in sessionStorage. React state alone is not
 * enough, and the case that proves it is the one this flow walks every time:
 * the photos step opens the camera full screen, and coming back from it
 * reloads the page on mobile. Without this, a customer answers the question,
 * types their reason, adds a model number, takes five photographs, comes back,
 * and is asked the same question again. That is worse than the silent resume it
 * replaced. sessionStorage keeps it to the tab and the sitting, writes nothing
 * server-side, and cannot be forged into anything but skipping a question.
 *
 * With nothing to ask, this is not in the way: it renders the flow directly.
 */
export function FittingEntry({
  prompt,
  sessionKey,
  children,
}: {
  prompt: EntryPrompt;
  /** Distinguishes one sitting's answer from another's; the claim or purchase id. */
  sessionKey: string;
  children: React.ReactNode;
}) {
  const [entered, setEntered] = useState(!prompt.ask);
  const flow = useRef<HTMLDivElement>(null);
  const answered = useRef(false);
  const storageKey = `rap.fitting.entered.${sessionKey}`;

  // An effect, not the useState initializer: sessionStorage does not exist on
  // the server, and reading it during render would make the markup disagree
  // with itself at hydration.
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(storageKey) === "1") setEntered(true);
    } catch {
      // Private mode, or storage disabled. The question simply repeats.
    }
  }, [storageKey]);

  // The whole screen changes under the customer, so focus has to follow it.
  // Without this it falls to the body, and the next Tab restarts at the top of
  // the document, back through the header and the nav. Only after an actual
  // answer, never on the visit where the question was already remembered.
  useEffect(() => {
    if (entered && answered.current) flow.current?.focus();
  }, [entered]);

  function answer() {
    answered.current = true;
    try {
      window.sessionStorage.setItem(storageKey, "1");
    } catch {
      // Nothing to do: the answer still holds for this render.
    }
    setEntered(true);
  }

  if (entered || !prompt.ask) {
    return (
      <div ref={flow} tabIndex={-1} className="outline-none">
        {children}
      </div>
    );
  }

  const copy = entryCopy(prompt);

  return (
    <div className="space-y-4">
      <ConciergeCard>{copy.question}</ConciergeCard>

      {copy.note && (
        <p className="text-[13px] leading-relaxed text-mist">{copy.note}</p>
      )}

      <Button onClick={answer}>{copy.primary}</Button>

      <Link
        href="/requests"
        className={cn(buttonVariants({ variant: "ghost", size: "lg" }))}
      >
        {copy.away}
      </Link>
    </div>
  );
}
