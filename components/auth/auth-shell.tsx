import * as React from "react";
import { LivingSky } from "../living-sky";
import { Logo } from "../Logo";

/**
 * The poster frame every auth screen shares. Deliberately the SAME structure and
 * classes as the welcome screen (app/page.tsx): living sky, logo, one heading in
 * the serif voice, one line of quiet body, one primary action. No bottom nav —
 * these are focused, one-breath screens (DESIGN.md).
 */
export function AuthShell({
  heading,
  intro,
  aside,
  children,
  footer,
}: {
  heading: React.ReactNode;
  intro?: React.ReactNode;
  /** A line in the guide's voice, above the form. */
  aside?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <>
      <LivingSky day={0} />
      <main
        id="main"
        className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 pb-10 pt-[calc(env(safe-area-inset-top)+1.5rem)]"
      >
        <div>
          <Logo />
        </div>

        <div className="flex flex-1 flex-col justify-center gap-6 py-8">
          <div className="space-y-3">
            <h1 className="font-serif text-[30px] leading-[1.15] tracking-[-0.01em] text-cloud">
              {heading}
            </h1>
            {intro && (
              <p className="text-[15px] leading-relaxed text-mist">{intro}</p>
            )}
          </div>

          {aside && (
            <p className="font-serif text-[17px] italic text-dawn">{aside}</p>
          )}

          {children}

          {footer}
        </div>
      </main>
    </>
  );
}

/** The calm message slot every auth form shares — apricot, polite, never red. */
export function AuthMessage({ error, note }: { error?: string | null; note?: string | null }) {
  return (
    <div aria-live="polite" className="min-h-[1.25rem]">
      {error && <p className="text-[13px] text-dawn">{error}</p>}
      {!error && note && <p className="text-[13px] text-mist">{note}</p>}
    </div>
  );
}
