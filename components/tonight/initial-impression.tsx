"use client";

import { useState, useTransition } from "react";
import { Chip } from "../ui/chip";
import { Button } from "../ui/button";
import { recordInitialImpression } from "../../lib/actions/impression";
import type { InitialImpression } from "../../lib/types";

const OPTIONS: { key: InitialImpression; label: string }[] = [
  { key: "firmer", label: "Firmer than expected" },
  { key: "just_right", label: "Feels right" },
  { key: "softer", label: "Softer than expected" },
];

// Calm acknowledgments, tied to the first impression.
const ACK: Record<InitialImpression, string> = {
  firmer: "New sets often feel firm at first. Give it a few nights to soften to you.",
  just_right: "A good sign. Let's see how the first nights settle in.",
  softer: "Noted. We'll see how it feels once your body learns the surface.",
};

/**
 * One-time first impression, captured on the first night or two (Change 1).
 * Styled exactly like the nightly check-in: quick-selector chips + optional note.
 * Persists via a server action, then shows a calm acknowledgment. On reload (or
 * from day 2), Tonight falls through to the nightly check-in instead.
 */
export function InitialImpression() {
  const [choice, setChoice] = useState<InitialImpression | null>(null);
  const [note, setNote] = useState("");
  const [recorded, setRecorded] = useState(false);
  const [pending, startTransition] = useTransition();

  if (recorded && choice) {
    return (
      <div className="animate-settle space-y-1.5">
        <p className="font-serif text-[19px] text-cloud">
          Thank you. I&apos;ll check in tomorrow.
        </p>
        <p className="font-serif text-[15px] italic text-mist">{ACK[choice]}</p>
      </div>
    );
  }

  function share() {
    if (!choice) return;
    const impression = choice;
    const trimmed = note.trim();
    startTransition(async () => {
      const res = await recordInitialImpression(impression, trimmed || undefined);
      if (res.ok) setRecorded(true);
    });
  }

  return (
    <div className="space-y-4">
      <p className="font-serif text-[15px] italic text-mist">
        Your mattress just arrived — how does it feel out of the box?
      </p>
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((o) => (
          <Chip
            key={o.key}
            selected={choice === o.key}
            onClick={() => setChoice(o.key)}
          >
            {o.label}
          </Chip>
        ))}
      </div>
      <input
        aria-label="Add a note about your first impression (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Anything you'd add? (optional)"
        className="h-12 w-full rounded-xl border border-[var(--line)] bg-white/[0.04] px-4 text-[16px] text-cloud outline-none transition-colors placeholder:text-mist/60 focus-visible:border-dawn/70 focus-visible:ring-2 focus-visible:ring-dawn/40"
      />
      <Button disabled={!choice || pending} onClick={share}>
        Share first impression
      </Button>
    </div>
  );
}
