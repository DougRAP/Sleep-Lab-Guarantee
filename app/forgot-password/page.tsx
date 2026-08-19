import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "../../components/auth/auth-shell";
import { ForgotPasswordForm } from "../../components/auth/password-forms";
import { isAuthConfigured } from "../../lib/auth/config";

// Never prerender: what this screen shows depends on the visitor's session and
// role, so it must be resolved per request regardless of build-time env.
export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  if (!isAuthConfigured()) redirect("/");

  return (
    <AuthShell
      pathname="/forgot-password"
      heading="Let's get you back in."
      intro="Tell us the email on your account and we'll send a link to set a new password."
    >
      <ForgotPasswordForm />

      <p className="text-[13px] text-mist">
        <Link
          href="/login"
          className="underline-offset-4 transition-colors hover:text-cloud hover:underline"
        >
          Back to log in
        </Link>
      </p>
    </AuthShell>
  );
}
