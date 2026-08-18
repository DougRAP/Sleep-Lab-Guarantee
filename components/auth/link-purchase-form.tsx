"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { Field } from "../ui/field";
import { Button, buttonVariants } from "../ui/button";
import { AuthMessage } from "./auth-shell";
import { linkAccountAction } from "../../lib/actions/auth";
import { cn } from "../../lib/utils";

/**
 * The RELAXED link step (v3 M-S5, Doug 2026-08-18): an already-authenticated
 * customer attaches their purchase or claim — sales order number, delivery
 * ZIP, or claim number (CG…), plus their last name. Any one identifier is
 * enough. A miss never dead-ends: the calm message comes with "Continue
 * anyway", which proceeds signed-in with nothing linked.
 */
export function LinkPurchaseForm() {
  const [identifier, setIdentifier] = useState("");
  const [zip, setZip] = useState("");
  const [last, setLast] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [offerContinue, setOfferContinue] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!last.trim() || (!identifier.trim() && !zip.trim())) {
      setError(
        "Add your last name, plus a sales order number, delivery ZIP, or claim number — any one of them is fine."
      );
      return;
    }
    setError(null);
    startTransition(async () => {
      // On success the action redirects; only a failure returns a result.
      const result = await linkAccountAction({
        identifier,
        deliveryZip: zip,
        lastName: last,
      });
      if (result && !result.ok) {
        setError(result.error);
        setOfferContinue(result.offerContinue);
      }
    });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field
        label="Sales order or claim number"
        autoComplete="off"
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        hint="From your receipt — or your CG claim number, if you have one."
      />
      <Field
        label="Delivery ZIP code"
        autoComplete="postal-code"
        inputMode="numeric"
        value={zip}
        onChange={(e) => setZip(e.target.value)}
        hint="Either one is fine — the order number or the ZIP where it was delivered."
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

      {offerContinue && (
        <Link
          href="/requests"
          className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "w-full")}
        >
          Continue anyway
        </Link>
      )}
    </form>
  );
}
