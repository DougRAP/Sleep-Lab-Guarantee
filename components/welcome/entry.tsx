"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Field } from "../ui/field";
import { Button } from "../ui/button";

/**
 * Two entry paths:
 *  - hasToken: arrived pre-identified from the retailer dashboard -> light verify
 *  - else: self-serve "find your purchase" lookup
 * M1: front-end only. M2 (handoff) wires verify/lookup to Supabase.
 */
export function Entry({ hasToken }: { hasToken: boolean }) {
  const router = useRouter();
  const [order, setOrder] = useState("");
  const [last, setLast] = useState("");
  const [delivery, setDelivery] = useState("");
  const [error, setError] = useState<string | null>(null);

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
    // M2: verify/lookup against Supabase, then route. For now, continue.
    router.push("/tonight");
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
            placeholder="e.g. 1011099325A"
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

      <Button type="submit">{hasToken ? "Continue" : "Find my purchase"}</Button>
    </form>
  );
}
