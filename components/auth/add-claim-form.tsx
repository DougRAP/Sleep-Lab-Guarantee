"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Field } from "../ui/field";
import { Button } from "../ui/button";
import { AuthMessage } from "./auth-shell";
import { linkAccountAction } from "../../lib/actions/auth";

/**
 * "Have a claim number? Add it here" (v3 M-S5) — the tracking list's way to
 * attach a CG claim to the signed-in account. Same server action as the link
 * step; on success it redirects (which refreshes the list).
 */
export function AddClaimForm() {
  const [claimNumber, setClaimNumber] = useState("");
  const [last, setLast] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!claimNumber.trim() || !last.trim()) {
      setError("Add your claim number (it starts with CG) and your last name.");
      return;
    }
    setError(null);
    startTransition(async () => {
      // On success the action redirects; only a failure returns a result.
      const result = await linkAccountAction({
        identifier: claimNumber,
        deliveryZip: "",
        lastName: last,
      });
      if (result && !result.ok) setError(result.error);
    });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field
        label="Claim number"
        autoComplete="off"
        placeholder="CG…"
        value={claimNumber}
        onChange={(e) => setClaimNumber(e.target.value)}
        hint="From your confirmation screen — it starts with CG."
      />
      <Field
        label="Last name"
        autoComplete="family-name"
        value={last}
        onChange={(e) => setLast(e.target.value)}
      />

      <AuthMessage error={error} />

      <Button type="submit" variant="ghost" disabled={pending}>
        Add my claim
      </Button>
    </form>
  );
}
