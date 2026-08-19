"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

/**
 * R-2 — the seam between a step flow and the footer.
 *
 * Doug, 2026-08-19: "Everybody likes back buttons. If you have room, you could
 * just put a footer on it." R-1 left the leading slot, but nothing could reach
 * it: the bar is rendered from the ROOT layout, which has no pathname, and the
 * claim's steps are component state rather than routes, so a footer Back cannot
 * simply call router.back(). The flow has to hand its own handler up.
 *
 * Deliberately tiny. It carries a callback and a label for assistive tech, and
 * no notion of what a flow is. A flow registers while it has somewhere to go
 * back to and unregisters when it does not, and the bar renders the control
 * only when something is registered. Nothing registered means the bar is
 * byte-identical to what R-1 shipped.
 *
 * Two contexts, not one, so that registering never re-renders the flow that
 * registered: the setter from useState is referentially stable, while the
 * target changes.
 *
 * OPEN QUESTION for Doug, deliberately not decided here. He said Back should be
 * "for all the application". This registry covers the two step flows, where
 * "back" means the previous step and is unambiguous. On an ordinary page it
 * would have to mean browser history, and on /guarantee reached from the bottom
 * nav that is whichever tab preceded it, which is not what a customer means by
 * back. One control with two meanings is a trap, so nothing here does history.
 * If he wants it, it is a small addition on top of this seam.
 */

export interface BackTarget {
  run: () => void;
  /** Announced instead of the bare word, so the control names its destination. */
  label?: string;
}

const BackTargetContext = createContext<BackTarget | null>(null);
const BackSetterContext = createContext<
  (next: BackTarget | null | ((cur: BackTarget | null) => BackTarget | null)) => void
>(() => {});

export function BackProvider({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<BackTarget | null>(null);
  return (
    <BackSetterContext.Provider value={setTarget}>
      <BackTargetContext.Provider value={target}>
        {children}
      </BackTargetContext.Provider>
    </BackSetterContext.Provider>
  );
}

/** What the footer renders, or null when no flow has anywhere to go back to. */
export function useBackTarget(): BackTarget | null {
  return useContext(BackTargetContext);
}

/**
 * Register this flow's Back while `onBack` is non-null; clear it otherwise, and
 * on unmount.
 *
 * The handler is held in a ref and the effect keys off a boolean, so a new
 * closure on every render does not re-fire the effect (which would set state on
 * every render). The cleanup only clears the target if it is still ours, so a
 * flow unmounting after the next one registered cannot blank a live control.
 */
export function useRegisterBack(
  onBack: (() => void) | null,
  label?: string
): void {
  const setTarget = useContext(BackSetterContext);
  const handler = useRef(onBack);
  // Assigned in an effect, not during render: a render-phase write is a side
  // effect React is free to discard or repeat under concurrent rendering, and
  // this one ran on every uncommitted render (registry review, 2026-08-19).
  // Effects run after commit, so the ref only ever holds a committed handler,
  // and useRef's initial value covers the first paint.
  useEffect(() => {
    handler.current = onBack;
  });

  const enabled = onBack !== null;
  const run = useCallback(() => handler.current?.(), []);

  useEffect(() => {
    if (!enabled) {
      // Ownership-guarded like the cleanup below. Unreachable while one flow is
      // mounted at a time, but the invariant this file claims has to hold for
      // the day a second registrant exists (a modal, a parallel route).
      setTarget((cur) => (cur?.run === run ? null : cur));
      return;
    }
    const mine: BackTarget = { run, label };
    setTarget(mine);
    return () => setTarget((cur) => (cur === mine ? null : cur));
  }, [enabled, label, run, setTarget]);
}
