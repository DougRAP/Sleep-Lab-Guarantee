// lib/data/seed.ts
// In-memory demo data — mirrors supabase/seed.sql. Backs the local fallback
// repository so the app runs and both entry flows work with NO real keys.

import type { Guarantee, Tip } from "../types";

/** ISO date (YYYY-MM-DD) `n` whole days before today (local). */
function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// One demo guarantee — delivery ~12 days ago so Tonight shows ~Day 12/90.
export const SEED_GUARANTEES: Guarantee[] = [
  {
    id: "seed-guarantee-turnbull",
    salesOrderNumber: "1011099325A",
    guaranteeNumber: "RAP-90-1011099325A",
    customerFirstName: "Andrew",
    customerLastName: "Turnbull",
    customerEmail: "ajturnbull@example.com",
    customerPhone: "3365086052",
    dealerName: "RAP Furniture — Shelby",
    dealerLocationId: "101",
    manufacturer: "Sealy",
    oemModel: "1234",
    productDescription: "Sealy Pillow Top — Queen",
    purchasePrice: 599.99,
    deliveryDate: isoDaysAgo(12),
    accessToken: "demo-turnbull-token",
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
