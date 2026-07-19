"use client";

import { useState, useTransition, type FormEvent } from "react";
import { ConciergeCard } from "../concierge-card";
import { Button } from "../ui/button";
import { sendConciergeMessage } from "../../lib/actions/concierge";

type Msg = { role: "user" | "assistant" | "system"; body: string };

/**
 * The concierge conversation as "printed light" (DESIGN.md). The guide's words
 * render as serif ConciergeCard messages that settle in; the user's replies are
 * quiet, marked by a hairline rule — not chat bubbles. No typing dots, no orb,
 * no avatar, no green send button.
 */
export function ConciergeChat({ greeting, initial }: { greeting: string; initial: Msg[] }) {
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || pending) return;
    setDraft("");
    setError(null);
    setMessages((m) => [...m, { role: "user", body: text }]);
    startTransition(async () => {
      const res = await sendConciergeMessage(text);
      if (res.ok) {
        setMessages((m) => [...m, { role: "assistant", body: res.reply }]);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="flex flex-1 flex-col">
      <div
        aria-live="polite"
        className="flex flex-1 flex-col justify-end gap-5 py-6"
      >
        <ConciergeCard>{greeting}</ConciergeCard>

        {messages.map((m, i) =>
          m.role === "user" ? (
            <p
              key={i}
              className="animate-settle border-l border-[var(--line)] pl-3 text-[14px] leading-relaxed text-mist"
            >
              {m.body}
            </p>
          ) : (
            <ConciergeCard key={i}>{m.body}</ConciergeCard>
          )
        )}

        {pending && (
          <p className="font-serif text-[15px] italic text-mist/70">
            Settling on a thought&hellip;
          </p>
        )}

        <div aria-live="polite" className="min-h-[1rem]">
          {error && <p className="text-[13px] text-dawn">{error}</p>}
        </div>
      </div>

      <form onSubmit={submit} className="pt-2">
        <div className="flex items-center gap-2">
          <input
            aria-label="Message your guide"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={"Tell your guide…"}
            className="h-12 flex-1 rounded-xl border border-[var(--line)] bg-white/[0.04] px-4 text-[15px] text-cloud outline-none transition-colors placeholder:text-mist/60 focus-visible:border-dawn/70 focus-visible:ring-2 focus-visible:ring-dawn/40"
          />
          <Button
            type="submit"
            variant="ghost"
            size="md"
            disabled={pending || !draft.trim()}
          >
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}
