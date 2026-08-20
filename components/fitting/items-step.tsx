"use client";

import { useState, useTransition } from "react";
import { ConciergeCard } from "../concierge-card";
import { Button } from "../ui/button";
import { StepActions } from "../ui/step-actions";
import { Field } from "../ui/field";
import { ConfirmRow } from "./confirm-row";
import { StillNeeded } from "./still-needed";
import { MAX_ITEMS } from "../../lib/fitting";
import { saveItems } from "../../lib/actions/fitting";
import type { ClaimItem } from "../../lib/types";

interface Draft {
  modelNumber: string;
  notSoiled: boolean;
  noOdors: boolean;
  notDamaged: boolean;
}

const EMPTY: Draft = {
  modelNumber: "",
  notSoiled: false,
  noOdors: false,
  notDamaged: false,
};

/** Step 2 — the mattress itself: model number + three condition confirmations. */
export function ItemsStep({
  initial,
  onBack,
  onDone,
}: {
  /** Absent on the first screen of the flow. */
  onBack?: () => void;
  initial: ClaimItem[];
  onDone: () => void;
}) {
  const [items, setItems] = useState<Draft[]>(
    initial.length
      ? initial.map((i) => ({
          modelNumber: i.modelNumber,
          notSoiled: i.notSoiled,
          noOdors: i.noOdors,
          notDamaged: i.notDamaged,
        }))
      : [{ ...EMPTY }]
  );
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  function patch(index: number, next: Partial<Draft>) {
    setItems((list) => list.map((it, i) => (i === index ? { ...it, ...next } : it)));
  }

  const named = items.filter((i) => i.modelNumber.trim());
  const stillNeeded: string[] = [];
  if (named.length === 0) stillNeeded.push("A model number from the tag or your receipt");
  for (const item of named) {
    if (!(item.notSoiled && item.noOdors && item.notDamaged)) {
      stillNeeded.push(`The three checks for ${item.modelNumber.trim()}`);
    }
  }
  const ready = stillNeeded.length === 0;

  function submit() {
    if (!ready || pending) return;
    startTransition(async () => {
      const res = await saveItems(named);
      if (res.ok) onDone();
      else setNote(res.error);
    });
  }

  return (
    <div className="space-y-6">
      <ConciergeCard>
        Now the mattress itself. The model number is on the tag sewn to the
        mattress, or printed on your receipt — whichever is easier to reach.
      </ConciergeCard>

      {items.map((item, index) => (
        <div key={index} className="space-y-3.5 border-t border-[var(--line)] pt-5 first:border-0 first:pt-0">
          {items.length > 1 && (
            <div className="flex items-center justify-between">
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-mist">
                Mattress {index + 1}
              </p>
              <button
                type="button"
                onClick={() => setItems((l) => l.filter((_, i) => i !== index))}
                className="font-mono text-[11px] uppercase tracking-[0.12em] text-mist transition-colors hover:text-cloud"
              >
                Remove
              </button>
            </div>
          )}

          <Field
            label="Model number"
            hint="From the tag on your mattress or on your receipt."
            value={item.modelNumber}
            onChange={(e) => patch(index, { modelNumber: e.target.value })}
            autoComplete="off"
          />

          <div className="space-y-2">
            <ConfirmRow
              checked={item.notSoiled}
              onToggle={() => patch(index, { notSoiled: !item.notSoiled })}
            >
              It isn&apos;t soiled or stained.
            </ConfirmRow>
            <ConfirmRow
              checked={item.noOdors}
              onToggle={() => patch(index, { noOdors: !item.noOdors })}
            >
              It doesn&apos;t carry any odors.
            </ConfirmRow>
            <ConfirmRow
              checked={item.notDamaged}
              onToggle={() => patch(index, { notDamaged: !item.notDamaged })}
            >
              It isn&apos;t otherwise damaged.
            </ConfirmRow>
          </div>
        </div>
      ))}

      {items.length < MAX_ITEMS && (
        <button
          type="button"
          onClick={() => setItems((l) => [...l, { ...EMPTY }])}
          className="font-mono text-[11px] uppercase tracking-[0.12em] text-dawn transition-colors hover:brightness-110"
        >
          + Add another item
        </button>
      )}

      <StillNeeded items={stillNeeded} />

      {note && <p className="text-[13px] text-mist">{note}</p>}

      <StepActions onBack={onBack}>
        <Button onClick={submit} disabled={!ready || pending}>
          Next — a few confirmations
        </Button>
      </StepActions>
    </div>
  );
}
