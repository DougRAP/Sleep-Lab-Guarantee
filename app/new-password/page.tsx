import { redirect } from "next/navigation";
import { AuthShell } from "../../components/auth/auth-shell";
import { NewPasswordForm } from "../../components/auth/password-forms";
import { isAuthConfigured } from "../../lib/auth/config";
import { getAuthUser } from "../../lib/auth/user";

// Never prerender: what this screen shows depends on the visitor's session and
// role, so it must be resolved per request regardless of build-time env.
export const dynamic = "force-dynamic";

// Landed here from the emailed reset link — /auth/callback has already exchanged
// the code for a session, so this is simply "choose a new password".
export default async function NewPasswordPage() {
  if (!isAuthConfigured()) redirect("/");
  const user = await getAuthUser();
  if (!user) redirect("/forgot-password");

  return (
    <AuthShell
      heading="Choose a new password."
      intro="This replaces the old one everywhere you're signed in."
    >
      <NewPasswordForm />
    </AuthShell>
  );
}
