"use client";

import { useState, useTransition } from "react";
import { Button } from "../ui/button";
import { requestCoupon } from "../../lib/actions/coupon";

/**
 * The one interactive part of the coupon card: the customer asks, and a code is
 * issued for them. On success the action revalidates /shop and the server
 * re-renders with the code — so there is nothing to hold in client state.
 *
 * A failure is a calm apricot line, never red (DESIGN.md).
 */
export function GetCouponButton() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function ask() {
    setError(null);
    startTransition(async () => {
      const result = await requestCoupon();
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="space-y-2">
      <Button type="button" disabled={pending} onClick={ask}>
        Get your coupon
      </Button>
      <div aria-live="polite" className="min-h-[1.25rem]">
        {error && <p className="text-[13px] text-dawn">{error}</p>}
      </div>
    </div>
  );
}
