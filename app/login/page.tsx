import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "../../components/auth/auth-shell";
import { AccountForm } from "../../components/auth/account-form";
import { isAuthConfigured } from "../../lib/auth/config";
import { getViewer } from "../../lib/auth/user";
import { getRepository } from "../../lib/data";
import { guardAuthRoute } from "../../lib/auth/routing";

// Never prerender: what this screen shows depends on the visitor's session and
// role, so it must be resolved per request regardless of build-time env.
export const dynamic = "force-dynamic";

// Returning customer. Email + password, then straight into the journey.
export default async function LoginPage() {
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

  return (
    <AuthShell
      pathname="/login"
      heading="Welcome back."
      intro="Log in and we'll pick up right where you left off."
    >
      <AccountForm mode="login" />

      <div className="space-y-2">
        <p className="text-[13px] text-mist">
          New here?{" "}
          <Link
            href="/signup"
            className="text-dawn underline-offset-4 transition-colors hover:underline"
          >
            Create your account
          </Link>
        </p>
        <p className="text-[13px] text-mist">
          <Link
            href="/forgot-password"
            className="underline-offset-4 transition-colors hover:text-cloud hover:underline"
          >
            Forgot your password?
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
