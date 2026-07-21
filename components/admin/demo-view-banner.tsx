import { switchDemoStaffViewAction } from "../../lib/actions/staff";

/**
 * The quiet one-line indicator for the DEMO staff view: which canned role is
 * live, and the way out of it. Rendered only when the view came from the demo
 * cookie — a real signed-in staff member never sees it. Uses the existing
 * mono/uppercase whisper (the SignOut register), nothing new.
 */
export function DemoViewBanner({ label }: { label: string }) {
  return (
    <div className="mt-4 flex items-center justify-between gap-4 border-b border-[var(--line)] pb-3">
      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-mist">
        Demo view &middot; {label}
      </p>
      <form action={switchDemoStaffViewAction}>
        <button
          type="submit"
          className="font-mono text-[11px] uppercase tracking-[0.12em] text-mist transition-colors hover:text-cloud"
        >
          Switch view
        </button>
      </form>
    </div>
  );
}
