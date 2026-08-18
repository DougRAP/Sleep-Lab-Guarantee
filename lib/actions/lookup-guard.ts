// lib/actions/lookup-guard.ts
// B-13 Pieza 1: throttle order+lastname guessing on the two surfaces that take
// them (linkPurchaseAction with real auth; verifyEntry lookup on the fallback).
// Two limits from app_settings: per-sales-order/hour (the real control — an
// attacker can rotate IPs but not the order they want) and per-IP/15min (extra
// friction). Fail-open: a limiter outage never blocks a legitimate customer.

"use server";

import { headers } from "next/headers";
import { getRepository } from "../data";
import { resolveSetting } from "../app-settings";
import { enforceRateLimit } from "../rate-limit";

/** Netlify's edge injects the real client IP here; it can't be spoofed by the
 *  client the way a raw X-Forwarded-For can. Falls back to XFF's first hop
 *  locally, then a constant so the per-order limit still applies. */
async function clientIp(): Promise<string> {
  const h = await headers();
  const nf = h.get("x-nf-client-connection-ip");
  if (nf) return nf.trim();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return "unknown";
}

const TOO_MANY =
  "Too many attempts just now. Please wait a few minutes and try again.";

export interface GuardResult {
  ok: boolean;
  /** Set when blocked — a distinct, calm message (never the not-found text). */
  error?: string;
}

/**
 * Enforce the lookup limits for one attempt on `salesOrderNumber`. Returns
 * ok=false with a wait message when either limit is exceeded. Any internal
 * failure resolves ok=true (fail-open).
 */
export async function guardLookupAttempt(salesOrderNumber: string): Promise<GuardResult> {
  try {
    const repo = getRepository();
    const settings = await repo.getAppSettings();
    const perOrder = resolveSetting("lookup_max_per_order_hour", settings);
    const perIp = resolveSetting("lookup_max_per_ip_15min", settings);
    const bump = repo.bumpRateCounter.bind(repo);
    const ip = await clientIp();
    const order = salesOrderNumber.trim().toLowerCase();

    const orderCheck = await enforceRateLimit(bump, {
      bucket: "lookup_order",
      key: order,
      windowSeconds: 3600,
      limit: perOrder,
    });
    const ipCheck = await enforceRateLimit(bump, {
      bucket: "lookup_ip",
      key: ip,
      windowSeconds: 900,
      limit: perIp,
    });

    if (!orderCheck.allowed || !ipCheck.allowed) {
      return { ok: false, error: TOO_MANY };
    }
    return { ok: true };
  } catch {
    // Fail-open: never let the guard itself become the outage.
    return { ok: true };
  }
}
