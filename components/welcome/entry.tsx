"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Field } from "../ui/field";
import { Button } from "../ui/button";
import { verifyEntry } from "../../lib/actions/verify";

/**
 * Two entry paths (PRD §3.1):
 *  - token present: arrived pre-identified from the retailer link -> light verify
 *    (last name + delivery date).
 *  - else: self-serve "find your purchase" lookup (sales order + last name).
 * Verify/lookup runs server-side; on success the action sets a signed session
 * cookie and redirects to /tonight. On failure it returns a calm message (no red).
 */
export function Entry({ token }: { token?: string }) {
  const hasToken = Boolean(token);
  const [order, setOrder] = useState("");
  const [last, setLast] = useState("");
  const [delivery, setDelivery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (hasToken) {
      if (!last.trim() || !delivery.trim()) {
        setError("Please confirm both details so we know it's you.");
        return;
      }
    } else if (!order.trim() || !last.trim()) {
      setError("Enter your sales order number and last name to find your purchase.");
      return;
    }
    setError(null);
    startTransition(async () => {
      // On success the action redirects; only a failure returns a result.
      const result = hasToken
        ? await verifyEntry({ mode: "token", token, lastName: last, deliveryDate: delivery })
        : await verifyEntry({ mode: "lookup", salesOrderNumber: order, lastName: last });
      if (result && !result.ok) setError(result.error);
    });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {hasToken ? (
        <>
          <Field
            label="Last name"
            autoComplete="family-name"
            value={last}
            onChange={(e) => setLast(e.target.value)}
          />
          <Field
            label="Delivery date"
            type="date"
            value={delivery}
            onChange={(e) => setDelivery(e.target.value)}
            hint="The day your mattress arrived."
          />
        </>
      ) : (
        <>
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
        </>
      )}

      <div aria-live="polite" className="min-h-[1.25rem]">
        {error && <p className="text-[13px] text-dawn">{error}</p>}
      </div>

      <Button type="submit" disabled={pending}>
        {hasToken ? "Continue" : "Find my purchase"}
      </Button>
    </form>
  );
}
