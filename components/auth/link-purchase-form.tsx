"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Field } from "../ui/field";
import { Button } from "../ui/button";
import { AuthMessage } from "./auth-shell";
import { linkPurchaseAction } from "../../lib/actions/auth";

/**
 * The link step: an already-authenticated customer attaches their purchase.
 * Same two fields the old front door asked for, but this is no longer the
 * login — the account was already proved, so a guessed sales order number
 * grants nothing on its own.
 */
export function LinkPurchaseForm() {
  const [order, setOrder] = useState("");
  const [last, setLast] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!order.trim() || !last.trim()) {
      setError("Enter your sales order number and last name so we can find your purchase.");
      return;
    }
    setError(null);
    startTransition(async () => {
      // On success the action redirects; only a failure returns a result.
      const result = await linkPurchaseAction({
        salesOrderNumber: order,
        lastName: last,
      });
      if (result && !result.ok) setError(result.error);
    });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field
        label="Sales order number"
        autoComplete="off"
        placeholder="e.g. 123"
        value={order}
        onChange={(e) => setOrder(e.target.value)}
        hint="On your receipt and your guarantee."
      />
      <Field
        label="Last name"
        autoComplete="family-name"
        value={last}
        onChange={(e) => setLast(e.target.value)}
      />

      <AuthMessage error={error} />

      <Button type="submit" disabled={pending}>
        Find my purchase
      </Button>
    </form>
  );
}
