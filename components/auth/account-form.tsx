"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Field } from "../ui/field";
import { PasswordField } from "../ui/password-field";
import { Button } from "../ui/button";
import { AuthMessage } from "./auth-shell";
import { signInAction, signUpAction } from "../../lib/actions/auth";
import { MIN_PASSWORD_LENGTH } from "../../lib/auth/config";

/**
 * Create an account, or log back in — the same two fields either way, so it is
 * one component with one mode flag. On success the action redirects; only a
 * failure comes back, and it renders as a calm apricot line (no red).
 */
export function AccountForm({ mode }: { mode: "signup" | "login" }) {
  const isSignUp = mode === "signup";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Enter your email and password to continue.");
      return;
    }
    if (isSignUp && password.length < MIN_PASSWORD_LENGTH) {
      setError(`Choose a password with at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = isSignUp
        ? await signUpAction({ email, password })
        : await signInAction({ email, password });
      if (result && !result.ok) setError(result.error);
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
      <PasswordField
        label="Password"
        autoComplete={isSignUp ? "new-password" : "current-password"}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        hint={isSignUp ? `At least ${MIN_PASSWORD_LENGTH} characters.` : undefined}
      />

      <AuthMessage error={error} />

      <Button type="submit" disabled={pending}>
        {isSignUp ? "Create my account" : "Log in"}
      </Button>
    </form>
  );
}
