"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Field } from "../ui/field";
import { Button } from "../ui/button";
import { startClaimAction } from "../../lib/actions/claim";
import { validateClaimEntry } from "../../lib/claim-flow";

/**
 * v3 entry (spec §2.2): identify + contact in ONE form on the landing page.
 * Sales order OR delivery ZIP; email OR mobile. Validation runs client-side
 * first with the same shared rule the action re-applies, so the calm message
 * appears without a round-trip. On success the action sets the claimant
 * cookie and redirects into /claim; only a failure returns here.
 */
export function ClaimEntryForm() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [salesOrderNumber, setSalesOrderNumber] = useState("");
  const [deliveryZip, setDeliveryZip] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: FormEvent) {
    e.preventDefault();
    const check = validateClaimEntry({
      firstName,
      lastName,
      salesOrderNumber,
      deliveryZip,
      contactEmail,
      contactPhone,
    });
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setError(null);
    startTransition(async () => {
      const form = new FormData();
      form.set("firstName", firstName);
      form.set("lastName", lastName);
      form.set("salesOrderNumber", salesOrderNumber);
      form.set("deliveryZip", deliveryZip);
      form.set("contactEmail", contactEmail);
      form.set("contactPhone", contactPhone);
      // On success the action redirects; only a failure returns a result.
      const result = await startClaimAction(form);
      if (result && !result.ok) setError(result.error);
    });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="First name"
          autoComplete="given-name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
        />
        <Field
          label="Last name"
          autoComplete="family-name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
        />
      </div>

      <Field
        label="Sales order number"
        autoComplete="off"
        value={salesOrderNumber}
        onChange={(e) => setSalesOrderNumber(e.target.value)}
        hint="On your receipt — or the delivery ZIP below. Either one is fine."
      />
      <Field
        label="Delivery ZIP code"
        autoComplete="postal-code"
        inputMode="numeric"
        value={deliveryZip}
        onChange={(e) => setDeliveryZip(e.target.value)}
        hint="Where the mattress was delivered."
      />

      <Field
        label="Email"
        type="email"
        autoComplete="email"
        value={contactEmail}
        onChange={(e) => setContactEmail(e.target.value)}
      />
      <Field
        label="Mobile number"
        type="tel"
        autoComplete="tel"
        value={contactPhone}
        onChange={(e) => setContactPhone(e.target.value)}
        hint="One of these is enough — we'll send your exchange authorization by text or email."
      />

      <div aria-live="polite" className="min-h-[1.25rem]">
        {error && <p className="text-[13px] text-dawn">{error}</p>}
      </div>

      <Button type="submit" disabled={pending}>
        Get started
      </Button>
    </form>
  );
}
