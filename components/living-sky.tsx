"use client";

import { useEffect, useState } from "react";

const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));

/**
 * The living sky — the app's ground. A night gradient that warms toward dawn
 * as the 90-day journey progresses, nudged by the user's real local time.
 * SSR renders a deterministic base (from `day`); time-of-day enhances after mount.
 */
export function LivingSky({ day, total = 90 }: { day: number; total?: number }) {
  const progress = clamp(day / total);
  const baseWarmth = 0.15 + progress * 0.7;
  const [warmth, setWarmth] = useState(baseWarmth);

  useEffect(() => {
    const h = new Date().getHours();
    let t = 0;
    if (h >= 4 && h <= 9) t = 0.3; // toward morning
    else if (h >= 18 && h <= 22) t = 0.15; // dusk
    setWarmth(clamp(baseWarmth + t));
  }, [baseWarmth]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg,#0A0F1A 0%,#111a2e 45%,#20304f 80%,#33314f 100%)",
        }}
      />
      <div
        className="absolute inset-0 transition-opacity duration-1000"
        style={{
          opacity: warmth,
          background:
            "linear-gradient(180deg,transparent 38%,rgba(91,81,112,0.5) 66%,rgba(169,115,138,0.55) 84%,rgba(233,179,132,0.78) 100%)",
        }}
      />
      <div
        className="absolute bottom-[-60px] left-1/2 h-[240px] w-[420px] -translate-x-1/2 rounded-full blur-md"
        style={{
          background:
            "radial-gradient(closest-side,rgba(233,179,132,0.45),rgba(233,179,132,0))",
          opacity: 0.4 + warmth * 0.5,
        }}
      />
    </div>
  );
}
