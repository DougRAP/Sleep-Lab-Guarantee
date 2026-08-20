"use client";

import { useState, useTransition, type FormEvent } from "react";
import { ConciergeCard } from "../concierge-card";
import { Button } from "../ui/button";
import { StepActions } from "../ui/step-actions";
import { StillNeeded } from "./still-needed";
import { saveIntake, sendIntakeMessage } from "../../lib/actions/fitting";

/**
 * Step 1 — the agent intake. Two fields land in the DB as structured data
 * either way:
 *   • no ANTHROPIC_API_KEY → a warm, scripted form (guided-first).
 *   • key present          → the same two answers captured conversationally,
 *                            extracted to JSON by the concierge tool-use loop.
 *
 * Even in conversation mode the customer can drop to the written form at any
 * time — nobody gets trapped in a script.
 */
export function IntakeStep({
  aiEnabled,
  greeting,
  initialReason,
  initialPreference,
  onBack,
  onDone,
}: {
  /** Absent on the first screen of the flow. */
  onBack?: () => void;
  aiEnabled: boolean;
  greeting: string;
  initialReason: string;
  initialPreference: string;
  onDone: () => void;
}) {
  const [written, setWritten] = useState(!aiEnabled);

  if (written) {
    return (
      <GuidedIntake
        onBack={onBack}
        greeting={greeting}
        initialReason={initialReason}
        initialPreference={initialPreference}
        canSwitchBack={aiEnabled}
        onSwitchBack={() => setWritten(false)}
        onDone={onDone}
      />
    );
  }

  return (
    <ConversationalIntake
      greeting={greeting}
      haveReasonInitially={Boolean(initialReason.trim())}
      havePreferenceInitially={Boolean(initialPreference.trim())}
      onWriteInstead={() => setWritten(true)}
      onDone={onDone}
    />
  );
}

/* -------------------------------------------------------------------------- */

function GuidedIntake({
  onBack,
  greeting,
  initialReason,
  initialPreference,
  canSwitchBack,
  onSwitchBack,
  onDone,
}: {
  onBack?: () => void;
  greeting: string;
  initialReason: string;
  initialPreference: string;
  canSwitchBack: boolean;
  onSwitchBack: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState(initialReason);
  const [preference, setPreference] = useState(initialPreference);
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  const stillNeeded = [
    ...(reason.trim() ? [] : ["How the mattress has been for you"]),
    ...(preference.trim() ? [] : ["What you'd rather have"]),
  ];

  function submit(e: FormEvent) {
    e.preventDefault();
    if (stillNeeded.length > 0 || pending) return;
    startTransition(async () => {
      const res = await saveIntake({
        reasonExperience: reason,
        preferredReplacement: preference,
      });
      if (res.ok) onDone();
      else setNote(res.error);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <ConciergeCard>{greeting}</ConciergeCard>

      <Prose
        label="Your experience"
        hint="Whatever comes to mind — there's no wrong way to say it."
        value={reason}
        onChange={setReason}
        placeholder="It's been firmer than I expected, and my shoulder wakes me…"
      />

      <Prose
        label="What you'd rather have"
        hint="A feel, a model, or just a direction — softer, firmer, something else."
        value={preference}
        onChange={setPreference}
        placeholder="Something softer through the shoulder, same size…"
      />

      <StillNeeded items={stillNeeded} />

      {note && <p className="text-[13px] text-mist">{note}</p>}

      <StepActions onBack={onBack}>
        <Button type="submit" disabled={stillNeeded.length > 0 || pending}>
          Next — the mattress itself
        </Button>
      </StepActions>

      {canSwitchBack && (
        <button
          type="button"
          onClick={onSwitchBack}
          className="font-mono text-[11px] uppercase tracking-[0.12em] text-mist transition-colors hover:text-cloud"
        >
          Talk it through instead
        </button>
      )}
    </form>
  );
}

function Prose({
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
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

/* -------------------------------------------------------------------------- */

type Turn = { role: "user" | "assistant"; body: string };

function ConversationalIntake({
  greeting,
  haveReasonInitially,
  havePreferenceInitially,
  onWriteInstead,
  onDone,
}: {
  greeting: string;
  haveReasonInitially: boolean;
  havePreferenceInitially: boolean;
  onWriteInstead: () => void;
  onDone: () => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [haveReason, setHaveReason] = useState(haveReasonInitially);
  const [havePreference, setHavePreference] = useState(havePreferenceInitially);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const ready = haveReason && havePreference;
  const stillNeeded = [
    ...(haveReason ? [] : ["How the mattress has been for you"]),
    ...(havePreference ? [] : ["What you'd rather have"]),
  ];

  function send(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || pending) return;
    setDraft("");
    setNote(null);
    const history = turns;
    setTurns((t) => [...t, { role: "user", body: text }]);
    startTransition(async () => {
      const res = await sendIntakeMessage(text, history);
      if (res.ok) {
        setTurns((t) => [...t, { role: "assistant", body: res.data.reply }]);
        setHaveReason(res.data.haveReason);
        setHavePreference(res.data.havePreference);
      } else {
        setNote(res.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div aria-live="polite" className="space-y-5">
        <ConciergeCard>{greeting}</ConciergeCard>
        {turns.map((t, i) =>
          t.role === "user" ? (
            <p
              key={i}
              className="animate-settle border-l border-[var(--line)] pl-3 text-[14px] leading-relaxed text-mist"
            >
              {t.body}
            </p>
          ) : (
            <ConciergeCard key={i}>{t.body}</ConciergeCard>
          )
        )}
        {pending && (
          <p className="font-serif text-[15px] italic text-mist/70">
            Settling on a thought&hellip;
          </p>
        )}
      </div>

      {note && <p className="text-[13px] text-mist">{note}</p>}

      <form onSubmit={send} className="flex items-center gap-2">
        <input
          aria-label="Tell your guide"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Tell your guide…"
          className="h-12 flex-1 rounded-xl border border-[var(--line)] bg-white/[0.04] px-4 text-[16px] text-cloud outline-none transition-colors placeholder:text-mist/60 focus-visible:border-dawn/70 focus-visible:ring-2 focus-visible:ring-dawn/40"
        />
        <Button type="submit" variant="ghost" size="md" disabled={pending || !draft.trim()}>
          Send
        </Button>
      </form>

      <StillNeeded items={stillNeeded} />

      {ready && (
        <Button onClick={onDone} disabled={pending}>
          Next — the mattress itself
        </Button>
      )}

      <button
        type="button"
        onClick={onWriteInstead}
        className="font-mono text-[11px] uppercase tracking-[0.12em] text-mist transition-colors hover:text-cloud"
      >
        Write it out instead
      </button>
    </div>
  );
}
