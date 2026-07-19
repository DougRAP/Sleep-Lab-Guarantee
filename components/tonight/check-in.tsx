"use client";

import { useState, useTransition } from "react";
import { Chip } from "../ui/chip";
import { Button } from "../ui/button";
import { logCheckIn } from "../../lib/actions/checkin";
import type { Feeling } from "../../lib/types";

const OPTIONS: { key: Feeling; label: string }[] = [
  { key: "better", label: "Better" },
  { key: "same", label: "The same" },
  { key: "rougher", label: "Rougher" },
];

// Calm acknowledgments, tied to the logged feeling.
const ACK: Record<Feeling, string> = {
  better: "That's the body settling in. I'll keep tonight simple.",
  same: "Steady is fine this early — most bodies take a few weeks.",
  rougher: "Noted. Let's try one small change before tonight.",
};

/**
 * Nightly check-in. Persists via a server action and reflects an already-logged
 * state on load (returning shows today's entry). Visuals + acknowledgment
 * unchanged from M1.
 */
export function CheckIn({ initialFeeling = null }: { initialFeeling?: Feeling | null }) {
  const [choice, setChoice] = useState<Feeling | null>(initialFeeling);
  const [logged, setLogged] = useState(Boolean(initialFeeling));
  const [pending, startTransition] = useTransition();

  if (logged && choice) {
    return (
      <div className="animate-settle space-y-1.5">
        <p className="font-serif text-[19px] text-cloud">
          Rest well. I&apos;ll check in tomorrow.
        </p>
        <p className="font-serif text-[15px] italic text-mist">{ACK[choice]}</p>
      </div>
    );
  }

  function log() {
    if (!choice) return;
    const feeling = choice;
    startTransition(async () => {
      const res = await logCheckIn(feeling);
      if (res.ok) setLogged(true);
    });
  }

  return (
    <div className="space-y-4">
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
      <Button disabled={!choice || pending} onClick={log}>
        Log tonight
      </Button>
    </div>
  );
}
