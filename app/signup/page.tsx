import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthShell } from "../../components/auth/auth-shell";
import { AccountForm } from "../../components/auth/account-form";
import { isAuthConfigured, PENDING_TOKEN_COOKIE } from "../../lib/auth/config";
import { getViewer } from "../../lib/auth/user";
import { getRepository } from "../../lib/data";
import { guardAuthRoute } from "../../lib/auth/routing";

// Never prerender: what this screen shows depends on the visitor's session and
// role, so it must be resolved per request regardless of build-time env.
export const dynamic = "force-dynamic";

// Create an account. Reached from the front door, and from a dashboard link —
// arriving with a token does NOT skip this step, it only pre-associates the
// purchase so the link happens automatically once the account exists.
export default async function SignUpPage() {
  const viewer = isAuthConfigured() ? await getViewer() : null;
  const linked = viewer
    ? Boolean(await getRepository().getGuaranteeForUser(viewer.userId))
    : false;

  const to = guardAuthRoute({
    authConfigured: isAuthConfigured(),
    authenticated: Boolean(viewer),
    linked,
    role: viewer?.role ?? null,
    hasLightSession: false,
  });
  if (to) redirect(to);

  const hasPendingToken = Boolean((await cookies()).get(PENDING_TOKEN_COOKIE)?.value);

  return (
    <AuthShell
      heading="Let's set up your account."
      intro="One account keeps your nights, your notes, and your 90-Night Comfort Guarantee together — on any device you pick up."
      aside={
        hasPendingToken
          ? "We already have your purchase — this just makes it yours."
          : undefined
      }
    >
      <AccountForm mode="signup" />

      <p className="text-[13px] text-mist">
        Already have an account?{" "}
        <Link
          href="/login"
          className="text-dawn underline-offset-4 transition-colors hover:underline"
        >
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}
