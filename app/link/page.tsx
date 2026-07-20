import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthShell } from "../../components/auth/auth-shell";
import { LinkPurchaseForm } from "../../components/auth/link-purchase-form";
import { SignOut } from "../../components/auth/sign-out";
import { isAuthConfigured, PENDING_TOKEN_COOKIE } from "../../lib/auth/config";
import { getViewer } from "../../lib/auth/user";
import { getRepository } from "../../lib/data";
import { guardLinkRoute } from "../../lib/auth/routing";

// Never prerender: what this screen shows depends on the visitor's session and
// role, so it must be resolved per request regardless of build-time env.
export const dynamic = "force-dynamic";

// The link step. Runs AFTER authentication, for a customer who has an account
// but no purchase attached yet. A parked dashboard token short-circuits this
// entirely via /auth/link-token.
export default async function LinkPage() {
  const authConfigured = isAuthConfigured();
  const viewer = authConfigured ? await getViewer() : null;
  const linked = viewer
    ? Boolean(await getRepository().getGuaranteeForUser(viewer.userId))
    : false;

  const to = guardLinkRoute({
    authConfigured,
    authenticated: Boolean(viewer),
    linked,
    role: viewer?.role ?? null,
    hasLightSession: false,
  });
  if (to) redirect(to);

  // Arrived on a dashboard link while already signed in — spend the token.
  if ((await cookies()).get(PENDING_TOKEN_COOKIE)?.value) {
    redirect("/auth/link-token");
  }

  return (
    <AuthShell
      heading="Now let's find your purchase."
      intro="Your sales order number is on your receipt and on your guarantee. Once it's linked, your 90 nights start showing up here."
      footer={
        <div className="border-t border-[var(--line)] pt-5">
          <SignOut />
        </div>
      }
    >
      <LinkPurchaseForm />
    </AuthShell>
  );
}
