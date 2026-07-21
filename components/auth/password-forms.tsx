"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Field } from "../ui/field";
import { Button } from "../ui/button";
import { AuthMessage } from "./auth-shell";
import {
  requestPasswordResetAction,
  updatePasswordAction,
} from "../../lib/actions/auth";
import { MIN_PASSWORD_LENGTH } from "../../lib/auth/config";
import { homePath } from "../../lib/auth/routing";

/** Ask for a reset link. Always answers the same way, whoever the email is. */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setError("Enter the email address on your account.");
      return;
    }
    setError(null);
    setNote(null);
    startTransition(async () => {
      const result = await requestPasswordResetAction({ email });
      if (result.ok) setNote(result.message);
      else setError(result.error);
    });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field
        label="Email"
        type="email"
        inputMode="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <AuthMessage error={error} note={note} />

      <Button type="submit" disabled={pending}>
        Send me a reset link
      </Button>
    </form>
  );
}

/** Set a new password, arriving from the emailed link (session already live). */
export function NewPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Choose a password with at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    setError(null);
    setNote(null);
    startTransition(async () => {
      const result = await updatePasswordAction({ password });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNote(result.message);
      router.replace(homePath());
    });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field
        label="New password"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
      />

      <AuthMessage error={error} note={note} />

      <Button type="submit" disabled={pending}>
        Set my password
      </Button>
    </form>
  );
}
