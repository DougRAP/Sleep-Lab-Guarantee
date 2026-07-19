"use client";

import { useState, useTransition } from "react";
import { ConciergeCard } from "../concierge-card";
import { Button } from "../ui/button";
import { Chip } from "../ui/chip";
import { Field } from "../ui/field";
import { ConfirmRow } from "./confirm-row";
import { StillNeeded } from "./still-needed";
import { saveVerify, submitFitting } from "../../lib/actions/fitting";
import type { PhoneKind } from "../../lib/types";

const PHONE_KINDS: { key: PhoneKind; label: string }[] = [
  { key: "mobile", label: "Mobile" },
  { key: "home", label: "Home" },
  { key: "work", label: "Work" },
];

/** Step 5 — how to reach them, where the mattress is, and that they still own it. */
export function VerifyStep({
  initial,
  onSubmitted,
}: {
  initial: {
    contactPhone: string;
    contactPhoneKind: PhoneKind | null;
    contactEmail: string;
    atDeliveryAddress: boolean | null;
    newAddress: string;
    stillOwns: boolean;
  };
  onSubmitted: (result: {
    raNumber: string;
    trackingNumber: string;
    dealerName: string | null;
  }) => void;
}) {
  const [phone, setPhone] = useState(initial.contactPhone);
  const [phoneKind, setPhoneKind] = useState<PhoneKind | null>(initial.contactPhoneKind);
  const [email, setEmail] = useState(initial.contactEmail);
  const [atDelivery, setAtDelivery] = useState<boolean | null>(initial.atDeliveryAddress);
  const [newAddress, setNewAddress] = useState(initial.newAddress);
  const [stillOwns, setStillOwns] = useState(initial.stillOwns);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const stillNeeded: string[] = [];
  if (!phone.trim() && !email.trim()) stillNeeded.push("A phone number or an email address");
  if (atDelivery === null) stillNeeded.push("Whether the mattress is still where it was delivered");
  else if (atDelivery === false && !newAddress.trim()) stillNeeded.push("Where the mattress is now");
  if (!stillOwns) stillNeeded.push("That you still own the mattress");
  const ready = stillNeeded.length === 0;

  function submit() {
    if (!ready || pending) return;
    startTransition(async () => {
      const saved = await saveVerify({
        contactPhone: phone,
        contactPhoneKind: phoneKind,
        contactEmail: email,
        atDeliveryAddress: atDelivery,
        newAddress,
        stillOwns,
      });
      if (!saved.ok) {
        setNote(saved.error);
        return;
      }
      const res = await submitFitting();
      if (res.ok) onSubmitted(res.data);
      else setNote(res.error);
    });
  }

  return (
    <div className="space-y-6">
      <ConciergeCard>
        Last part. Make sure we can reach you, and tell me where the mattress is
        now — then I&apos;ll pass this to your dealer.
      </ConciergeCard>

      <Field
        label="Phone"
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        autoComplete="tel"
      />

      <div className="space-y-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-mist">
          Phone type
        </p>
        <div className="flex flex-wrap gap-2">
          {PHONE_KINDS.map((k) => (
            <Chip
              key={k.key}
              selected={phoneKind === k.key}
              onClick={() => setPhoneKind(phoneKind === k.key ? null : k.key)}
            >
              {k.label}
            </Chip>
          ))}
        </div>
      </div>

      <Field
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
      />

      <div className="space-y-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-mist">
          Is the mattress still at the delivery address?
        </p>
        <div className="flex flex-wrap gap-2">
          <Chip selected={atDelivery === true} onClick={() => setAtDelivery(true)}>
            Yes
          </Chip>
          <Chip selected={atDelivery === false} onClick={() => setAtDelivery(false)}>
            No
          </Chip>
        </div>
      </div>

      {atDelivery === false && (
        <Field
          label="Where it is now"
          hint="Street, city, state, and ZIP."
          value={newAddress}
          onChange={(e) => setNewAddress(e.target.value)}
          autoComplete="street-address"
        />
      )}

      <ConfirmRow checked={stillOwns} onToggle={() => setStillOwns(!stillOwns)}>
        I still personally own this mattress.
      </ConfirmRow>

      <StillNeeded items={stillNeeded} />

      {note && <p className="text-[13px] text-mist">{note}</p>}

      <Button onClick={submit} disabled={!ready || pending}>
        {pending ? "Passing it along…" : "Send this to my dealer"}
      </Button>
    </div>
  );
}
