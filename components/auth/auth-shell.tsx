import * as React from "react";
import { footerHiddenSurface } from "../../lib/shell";
import { cn } from "../../lib/utils";
import { LivingSky } from "../living-sky";
import { Logo } from "../Logo";

/**
 * The poster frame every auth screen shares. Deliberately the SAME structure and
 * classes as the welcome screen (app/page.tsx): living sky, logo, one heading in
 * the serif voice, one line of quiet body, one primary action.
 *
 * R-1 (2026-08-19): the account screens still carry no bottom bar — every tab
 * there would bounce a signed-out visitor straight back to login, so
 * footerPlan() hides it. But /link shares this frame and is NOT an account
 * screen: a visitor there is signed in, and Requests is a real destination.
 *
 * So the frame needs to know which screen it is on, and it ASKS lib/shell.ts
 * rather than taking a boolean. A hand-passed flag was a second copy of the
 * surface rule living in a component, which CLAUDE.md forbids precisely because
 * the two drift: a sixth screen would have to be remembered in both places, and
 * the padding and the bar would silently disagree.
 */
export function AuthShell({
  heading,
  intro,
  aside,
  children,
  footer,
  pathname,
}: {
  heading: React.ReactNode;
  intro?: React.ReactNode;
  /** A line in the guide's voice, above the form. */
  aside?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** The route this frame is rendering, so it can ask whether a bar is there. */
  pathname: string;
}) {
  const withFooter = !footerHiddenSurface(pathname);
  return (
    <>
      <LivingSky day={0} />
      <main
        id="main"
        className={cn(
          "relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 pt-[calc(env(safe-area-inset-top)+1.5rem)]",
          withFooter ? "pb-28" : "pb-10"
        )}
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
