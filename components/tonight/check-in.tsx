"use client";

import { useState } from "react";
import { Chip } from "../ui/chip";
import { Button } from "../ui/button";

const OPTIONS = [
  { key: "better", label: "Better" },
  { key: "same", label: "The same" },
  { key: "rougher", label: "Rougher" },
] as const;

// M1: static acknowledgments. In M3 these become the tunable tips/concierge layer.
const ACK: Record<string, string> = {
  better: "That's the body settling in. I'll keep tonight simple.",
  same: "Steady is fine this early — most bodies take a few weeks.",
  rougher: "Noted. Let's try one small change before tonight.",
};

export function CheckIn() {
  const [choice, setChoice] = useState<string | null>(null);
  const [logged, setLogged] = useState(false);

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
      <Button disabled={!choice} onClick={() => setLogged(true)}>
        Log tonight
      </Button>
    </div>
  );
}
