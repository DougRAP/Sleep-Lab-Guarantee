"use client";

import { useState, useTransition } from "react";
import { ConciergeCard } from "../concierge-card";
import { Button } from "../ui/button";
import { StepActions } from "../ui/step-actions";
import { ConfirmRow } from "./confirm-row";
import { StillNeeded } from "./still-needed";
import { CONFIRMATION_TERMS } from "../../lib/fitting";
import { saveConfirmations } from "../../lib/actions/fitting";
import type { ConfirmationKey } from "../../lib/types";

/** Step 3 — the 90-Night terms, tapped one at a time. All are needed to go on. */
export function ConfirmationsStep({
  initial,
  onBack,
  onDone,
}: {
  /** Absent on the first screen of the flow. */
  onBack?: () => void;
  initial: ConfirmationKey[];
  onDone: () => void;
}) {
  const [checked, setChecked] = useState<Set<ConfirmationKey>>(new Set(initial));
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  function toggle(key: ConfirmationKey) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const missing = CONFIRMATION_TERMS.filter((t) => !checked.has(t.key));
  const ready = missing.length === 0;

  function submit() {
    if (!ready || pending) return;
    startTransition(async () => {
      const res = await saveConfirmations([...checked]);
      if (res.ok) onDone();
      else setNote(res.error);
    });
  }

  return (
    <div className="space-y-6">
      <ConciergeCard>
        A few things the guarantee asks us to confirm together. Read each one and
        tap it if it&apos;s true for you.
      </ConciergeCard>

      <div className="space-y-2">
        {CONFIRMATION_TERMS.map((term) => (
          <ConfirmRow
            key={term.key}
            checked={checked.has(term.key)}
            onToggle={() => toggle(term.key)}
          >
            {term.statement}
          </ConfirmRow>
        ))}
      </div>

      <StillNeeded items={missing.map((t) => t.statement)} />

      {note && <p className="text-[13px] text-mist">{note}</p>}

      <StepActions onBack={onBack}>
        <Button onClick={submit} disabled={!ready || pending}>
          Next — a few photos
        </Button>
      </StepActions>
    </div>
  );
}
