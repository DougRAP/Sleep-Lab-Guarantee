// lib/data/seed.ts
// In-memory demo data — mirrors supabase/seed.sql. Backs the local fallback
// repository so the app runs and both entry flows work with NO real keys.

import type {
  DealerLocation,
  Guarantee,
  InitialImpressionRecord,
  Tip,
} from "../types";

/** ISO date (YYYY-MM-DD) `n` whole days before today (local). */
function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Two demo guarantees:
//  - Demo (order 123 / last name "demo"): a FRESH purchase (delivery = today,
//    Day 0) so the journey helps from night one — the initial-impression
//    prompt shows first. These are the credentials used for demos.
//  - Rivera: mid-journey (~Day 6) with the first impression already recorded, so
//    the nightly check-in flow is also demoable.
export const SEED_GUARANTEES: Guarantee[] = [
  {
    id: "seed-guarantee-demo",
    salesOrderNumber: "123",
    guaranteeNumber: "RAP-90-123",
    customerFirstName: "Andrew",
    customerLastName: "Demo",
    customerEmail: "andrew.demo@example.com",
    customerPhone: "3365086052",
    dealerName: "RAP Furniture — Shelby",
    dealerLocationId: "101",
    manufacturer: "Sealy",
    oemModel: "1234",
    productDescription: "Sealy Pillow Top — Queen",
    purchasePrice: 599.99,
    deliveryDate: isoDaysAgo(0),
    accessToken: "demo-primary-token",
  },
  {
    id: "seed-guarantee-rivera",
    salesOrderNumber: "1011099326B",
    guaranteeNumber: "RAP-90-1011099326B",
    customerFirstName: "Maya",
    customerLastName: "Rivera",
    customerEmail: "mrivera@example.com",
    customerPhone: "7045551987",
    dealerName: "RAP Furniture — Shelby",
    dealerLocationId: "101",
    manufacturer: "Stearns & Foster",
    oemModel: "5678",
    productDescription: "Stearns & Foster Luxury Firm — King",
    purchasePrice: 1299.99,
    deliveryDate: isoDaysAgo(6),
    accessToken: "demo-rivera-token",
  },
];

// PLACEHOLDER dealer — real dealer contact/coupon replaces this before launch.
// Keyed by "101" so both demo guarantees (dealerLocationId "101") resolve to it.
// Serves the dealer-triage card (#4) and the shop coupon (#6).
export const SEED_DEALER_LOCATIONS: DealerLocation[] = [
  {
    id: "101",
    name: "Demo Bedding Co.",
    phone: "(555) 012-3456",
    email: "care@demobedding.example",
    siteUrl: "https://example.com/shop",
    couponCode: "SLEEPLAB20",
    couponPct: 20,
  },
];

// Rivera has already shared a first impression (mid-journey demo).
export const SEED_INITIAL_IMPRESSIONS: InitialImpressionRecord[] = [
  {
    guaranteeId: "seed-guarantee-rivera",
    impression: "firmer",
    note: "Firmer than the floor model felt.",
    at: `${isoDaysAgo(6)}T09:00:00.000Z`,
  },
];

export const SEED_TIPS: Tip[] = [
  {
    id: "seed-tip-1",
    dayMin: 0,
    dayMax: 7,
    phase: "settle_in",
    timeOfDay: "evening",
    title: "Give it a week",
    body: "The first nights on a new mattress can feel unfamiliar. Keep your room cool and dark, and let your body learn the new surface.",
    active: true,
  },
  {
    id: "seed-tip-2",
    dayMin: 0,
    dayMax: 30,
    phase: "settle_in",
    timeOfDay: "night",
    title: "Adjustment takes time",
    body: "Most bodies take four to six weeks to fully settle in. A little stiffness early on is normal and usually eases.",
    active: true,
  },
  {
    id: "seed-tip-3",
    dayMin: 8,
    dayMax: 21,
    phase: "settle_in",
    timeOfDay: "morning",
    title: "Rotate, don't judge yet",
    body: "Around week two, rotate the mattress head-to-foot to keep it even. Hold off on any verdict — you're still adjusting.",
    active: true,
  },
  {
    id: "seed-tip-4",
    dayMin: 22,
    dayMax: 30,
    phase: "settle_in",
    timeOfDay: "evening",
    title: "Almost through settling in",
    body: "You're near the end of the adjustment window. If sleep is trending better, that's the body finding its rhythm.",
    active: true,
  },
  {
    id: "seed-tip-5",
    dayMin: 31,
    dayMax: 90,
    phase: "safety_net",
    timeOfDay: "any",
    title: "The comfort exchange is open",
    body: "If it still isn't right, your one-time comfort exchange is available. When you're ready, we'll walk through it together.",
    active: true,
  },
];
