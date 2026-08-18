// lib/data/seed.ts
// In-memory demo data — mirrors supabase/seed.sql. Backs the local fallback
// repository so the app runs and both entry flows work with NO real keys.

import type {
  Claim,
  ClaimItem,
  ClaimNote,
  DealerLocation,
  Guarantee,
  InitialImpressionRecord,
  Tip,
} from "../types";
import { CONFIRMATION_KEYS } from "../fitting";

/** ISO date (YYYY-MM-DD) `n` whole days before today (local). */
function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** ISO timestamp `n` whole days before today, at a fixed mid-day hour. */
function isoTimestampDaysAgo(n: number): string {
  return `${isoDaysAgo(n)}T15:00:00.000Z`;
}

/**
 * `RA-YYMMDD-XXXX` in the lib/ra.ts format, dated `n` days back, so a seeded
 * RA's date segment always agrees with its claim's `submittedAt` even though
 * the seed is relative to "today". Suffixes are drawn from CODE_ALPHABET.
 */
function raNumberDaysAgo(n: number, suffix: string): string {
  const iso = isoDaysAgo(n);
  return `RA-${iso.slice(2, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}-${suffix}`;
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
    dealerName: "City Mattress",
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
    dealerName: "City Mattress",
    dealerLocationId: "101",
    manufacturer: "Stearns & Foster",
    oemModel: "5678",
    productDescription: "Stearns & Foster Luxury Firm — King",
    purchasePrice: 1299.99,
    deliveryDate: isoDaysAgo(6),
    accessToken: "demo-rivera-token",
  },
  // The six below back SEED_CLAIMS, so the admin list reads like a live
  // program (one request per status). APPEND-ONLY past this point: tests
  // address the two demo entries above by index and by id.
  {
    id: "seed-guarantee-calloway",
    salesOrderNumber: "1011099412A",
    guaranteeNumber: "RAP-90-1011099412A",
    customerFirstName: "Denise",
    customerLastName: "Calloway",
    customerEmail: "d.calloway@example.com",
    customerPhone: "7045550214",
    customerStreet: "118 Maple Row",
    customerCity: "Shelby",
    customerState: "NC",
    customerZip: "28150",
    dealerName: "City Mattress",
    dealerLocationId: "101",
    manufacturer: "Sealy",
    oemModel: "2214",
    productDescription: "Sealy Posturepedic Plush — Queen",
    purchasePrice: 749.99,
    deliveryDate: isoDaysAgo(38),
    accessToken: "demo-calloway-token",
  },
  {
    id: "seed-guarantee-boyd",
    salesOrderNumber: "1011099437K",
    guaranteeNumber: "RAP-90-1011099437K",
    customerFirstName: "Marcus",
    customerLastName: "Boyd",
    customerEmail: "marcus.boyd@example.com",
    customerPhone: "8285550172",
    customerStreet: "42 Laurel Bend",
    customerCity: "Asheville",
    customerState: "NC",
    customerZip: "28801",
    dealerName: "City Mattress",
    dealerLocationId: "101",
    manufacturer: "Serta",
    oemModel: "8871",
    productDescription: "Serta Perfect Sleeper — King",
    purchasePrice: 899.99,
    deliveryDate: isoDaysAgo(45),
    accessToken: "demo-boyd-token",
  },
  {
    id: "seed-guarantee-natarajan",
    salesOrderNumber: "1011099450M",
    guaranteeNumber: "RAP-90-1011099450M",
    customerFirstName: "Priya",
    customerLastName: "Natarajan",
    customerEmail: "priya.natarajan@example.com",
    customerPhone: "9805550346",
    customerStreet: "907 Camden Loop",
    customerCity: "Charlotte",
    customerState: "NC",
    customerZip: "28202",
    dealerName: "City Mattress",
    dealerLocationId: "101",
    manufacturer: "Stearns & Foster",
    oemModel: "4402",
    productDescription: "Stearns & Foster Estate — Queen",
    purchasePrice: 1499.99,
    deliveryDate: isoDaysAgo(58),
    accessToken: "demo-natarajan-token",
  },
  {
    id: "seed-guarantee-kowalski",
    salesOrderNumber: "1011099461T",
    guaranteeNumber: "RAP-90-1011099461T",
    customerFirstName: "Evan",
    customerLastName: "Kowalski",
    customerEmail: "e.kowalski@example.com",
    customerPhone: "7045550488",
    customerStreet: "412 Pinehurst Ct",
    customerCity: "Shelby",
    customerState: "NC",
    customerZip: "28150",
    dealerName: "City Mattress",
    dealerLocationId: "101",
    manufacturer: "Beautyrest",
    oemModel: "3320",
    productDescription: "Beautyrest Harmony — Split King (pair)",
    purchasePrice: 1899.99,
    deliveryDate: isoDaysAgo(63),
    accessToken: "demo-kowalski-token",
  },
  {
    id: "seed-guarantee-simmons",
    salesOrderNumber: "1011099478E",
    guaranteeNumber: "RAP-90-1011099478E",
    customerFirstName: "Gloria",
    customerLastName: "Simmons",
    customerEmail: "gloria.simmons@example.com",
    customerPhone: "8285550631",
    customerStreet: "23 Birchfield Ave",
    customerCity: "Asheville",
    customerState: "NC",
    customerZip: "28801",
    dealerName: "City Mattress",
    dealerLocationId: "101",
    manufacturer: "Sealy",
    oemModel: "5583",
    productDescription: "Sealy Crown Jewel — Queen",
    purchasePrice: 999.99,
    deliveryDate: isoDaysAgo(74),
    accessToken: "demo-simmons-token",
  },
  {
    id: "seed-guarantee-delgado",
    salesOrderNumber: "1011099489R",
    guaranteeNumber: "RAP-90-1011099489R",
    customerFirstName: "Ray",
    customerLastName: "Delgado",
    customerEmail: "ray.delgado@example.com",
    customerPhone: "9805550759",
    customerStreet: "1508 Weller St",
    customerCity: "Gastonia",
    customerState: "NC",
    customerZip: "28052",
    dealerName: "City Mattress",
    dealerLocationId: "101",
    manufacturer: "Serta",
    oemModel: "1108",
    productDescription: "Serta iComfort — Twin XL",
    purchasePrice: 579.99,
    deliveryDate: isoDaysAgo(52),
    accessToken: "demo-delgado-token",
  },
  // Fresh, UNLINKED test guarantees (2026-07-22): day 0, ~15 and ~35, with no
  // claims — always a clean case to link and walk the full journey with.
  {
    id: "seed-guarantee-fleming",
    salesOrderNumber: "1011099501F",
    guaranteeNumber: "RAP-90-1011099501F",
    customerFirstName: "Alma",
    customerLastName: "Fleming",
    customerEmail: "alma.fleming@example.com",
    customerPhone: "7045550901",
    customerStreet: "76 Dogwood Terrace",
    customerCity: "Shelby",
    customerState: "NC",
    customerZip: "28150",
    dealerName: "City Mattress",
    dealerLocationId: "101",
    manufacturer: "Sealy",
    oemModel: "7710",
    productDescription: "Sealy Essentials — Queen",
    purchasePrice: 649.99,
    deliveryDate: isoDaysAgo(0),
    accessToken: "demo-fleming-token",
  },
  {
    id: "seed-guarantee-mendez",
    salesOrderNumber: "1011099502M",
    guaranteeNumber: "RAP-90-1011099502M",
    customerFirstName: "Victor",
    customerLastName: "Mendez",
    customerEmail: "victor.mendez@example.com",
    customerPhone: "7045550902",
    customerStreet: "301 Kings Rd",
    customerCity: "Charlotte",
    customerState: "NC",
    customerZip: "28202",
    dealerName: "City Mattress",
    dealerLocationId: "101",
    manufacturer: "Serta",
    oemModel: "6620",
    productDescription: "Serta Blue Lagoon — Full",
    purchasePrice: 799.99,
    deliveryDate: isoDaysAgo(15),
    accessToken: "demo-mendez-token",
  },
  {
    id: "seed-guarantee-tran",
    salesOrderNumber: "1011099503T",
    guaranteeNumber: "RAP-90-1011099503T",
    customerFirstName: "June",
    customerLastName: "Tran",
    customerEmail: "june.tran@example.com",
    customerPhone: "7045550903",
    customerStreet: "88 Riverbend Dr",
    customerCity: "Gastonia",
    customerState: "NC",
    customerZip: "28052",
    dealerName: "City Mattress",
    dealerLocationId: "101",
    manufacturer: "Beautyrest",
    oemModel: "5510",
    productDescription: "Beautyrest Silver — Queen",
    purchasePrice: 1099.99,
    deliveryDate: isoDaysAgo(35),
    accessToken: "demo-tran-token",
  },
];

/**
 * v3: the dealer location an UNLINKED anonymous claim is scoped to (spec §4 —
 * default dealer = City Mattress). Matches the one seeded location below.
 */
export const DEFAULT_DEALER_LOCATION_ID = "101";

// PLACEHOLDER dealer — real dealer contact/coupon replaces this before launch.
// Keyed by "101" so both demo guarantees (dealerLocationId "101") resolve to it.
// Serves the dealer-triage card (#4) and the shop coupon (#6).
export const SEED_DEALER_LOCATIONS: DealerLocation[] = [
  {
    id: "101",
    name: "City Mattress",
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

/**
 * Submitted-or-later requests for the six seeded customers above — one per
 * status, so the admin list reads like a live program out of the box. Shapes
 * mirror exactly what MemoryRepository produces at runtime (createDraftClaim →
 * submitClaim), with the adjudication timestamps a later status implies.
 * None belong to the two demo guarantees: their journeys must start with no
 * requests (tests and the demo script both assume it).
 */
export const SEED_CLAIMS: Claim[] = [
  {
    // Day ~38 of 90 — just sent, nobody has read it yet.
    id: "seed-claim-calloway",
    guaranteeId: "seed-guarantee-calloway",
    status: "submitted",
    step: "submitted",
    confirmations: [...CONFIRMATION_KEYS],
    preVerified: true,
    reasonExperience:
      "It sleeps much warmer than the floor model and I wake up with lower-back stiffness.",
    preferredReplacement: "Something cooler, medium-firm.",
    contactPhone: "7045550214",
    contactPhoneKind: "mobile",
    contactEmail: "d.calloway@example.com",
    atDeliveryAddress: true,
    newAddress: null,
    stillOwns: true,
    raNumber: raNumberDaysAgo(2, "V7KM"),
    trackingNumber: "RAP-W4XKQ7MD",
    submittedAt: isoTimestampDaysAgo(2),
    createdAt: isoTimestampDaysAgo(3),
    updatedAt: isoTimestampDaysAgo(2),
  },
  {
    // Day ~45 — RAP picked it up two days after submission.
    id: "seed-claim-boyd",
    guaranteeId: "seed-guarantee-boyd",
    status: "in_review",
    step: "submitted",
    confirmations: [...CONFIRMATION_KEYS],
    preVerified: false,
    reasonExperience:
      "Far softer than the one we tried in the store — I sink in and can't turn over easily.",
    preferredReplacement: "The firmer Perfect Sleeper we almost bought.",
    contactPhone: "8285550172",
    contactPhoneKind: "mobile",
    contactEmail: "marcus.boyd@example.com",
    atDeliveryAddress: true,
    newAddress: null,
    stillOwns: true,
    raNumber: raNumberDaysAgo(6, "T4XG"),
    trackingNumber: "RAP-N3TGV8PH",
    submittedAt: isoTimestampDaysAgo(6),
    reviewedAt: isoTimestampDaysAgo(4),
    createdAt: isoTimestampDaysAgo(7),
    updatedAt: isoTimestampDaysAgo(4),
  },
  {
    // Day ~58 — approved five days after review; dealer not yet scheduled.
    id: "seed-claim-natarajan",
    guaranteeId: "seed-guarantee-natarajan",
    status: "approved",
    step: "submitted",
    confirmations: [...CONFIRMATION_KEYS],
    preVerified: true,
    reasonExperience:
      "Pressure points at the hip and shoulder every morning, even after two months.",
    preferredReplacement: "A plusher Estate model, same size.",
    contactPhone: "9805550346",
    contactPhoneKind: "home",
    contactEmail: "priya.natarajan@example.com",
    atDeliveryAddress: true,
    newAddress: null,
    stillOwns: true,
    raNumber: raNumberDaysAgo(12, "R8DP"),
    trackingNumber: "RAP-C6RJDM24",
    submittedAt: isoTimestampDaysAgo(12),
    reviewedAt: isoTimestampDaysAgo(9),
    approvedAt: isoTimestampDaysAgo(7),
    createdAt: isoTimestampDaysAgo(13),
    updatedAt: isoTimestampDaysAgo(7),
  },
  {
    // Day ~63 — approved, and the dealer has the exchange on the calendar.
    id: "seed-claim-kowalski",
    guaranteeId: "seed-guarantee-kowalski",
    status: "dealer_scheduled",
    step: "submitted",
    confirmations: [...CONFIRMATION_KEYS],
    preVerified: false,
    reasonExperience:
      "Both halves of the split king feel firmer than expected; neither of us has adjusted.",
    preferredReplacement: "The softer Harmony option on both sides.",
    contactPhone: "7045550488",
    contactPhoneKind: "mobile",
    contactEmail: "e.kowalski@example.com",
    atDeliveryAddress: false,
    newAddress: "412 Pinehurst Ct, Shelby, NC 28150",
    stillOwns: true,
    raNumber: raNumberDaysAgo(16, "H6WC"),
    trackingNumber: "RAP-F9HWSL73",
    submittedAt: isoTimestampDaysAgo(16),
    reviewedAt: isoTimestampDaysAgo(13),
    approvedAt: isoTimestampDaysAgo(11),
    createdAt: isoTimestampDaysAgo(17),
    updatedAt: isoTimestampDaysAgo(5),
  },
  {
    // Day ~74 — the exchange happened; this journey is resolved.
    id: "seed-claim-simmons",
    guaranteeId: "seed-guarantee-simmons",
    status: "completed",
    step: "submitted",
    confirmations: [...CONFIRMATION_KEYS],
    preVerified: true,
    reasonExperience:
      "Too firm from the first week and it never broke in the way the store said it would.",
    preferredReplacement: "The pillow-top version of the same set.",
    contactPhone: "8285550631",
    contactPhoneKind: "home",
    contactEmail: "gloria.simmons@example.com",
    atDeliveryAddress: true,
    newAddress: null,
    stillOwns: true,
    raNumber: raNumberDaysAgo(30, "Q3NF"),
    trackingNumber: "RAP-D2QNXB85",
    submittedAt: isoTimestampDaysAgo(30),
    reviewedAt: isoTimestampDaysAgo(27),
    approvedAt: isoTimestampDaysAgo(24),
    completedAt: isoTimestampDaysAgo(18),
    createdAt: isoTimestampDaysAgo(31),
    updatedAt: isoTimestampDaysAgo(18),
  },
  {
    // Day ~52 — reviewed and declined; the dealer talks it through with them.
    id: "seed-claim-delgado",
    guaranteeId: "seed-guarantee-delgado",
    status: "denied",
    step: "submitted",
    confirmations: [...CONFIRMATION_KEYS],
    preVerified: false,
    reasonExperience: "Feels lumpy on one side after a month and a half.",
    preferredReplacement: "Whatever holds its shape better.",
    contactPhone: "9805550759",
    contactPhoneKind: "mobile",
    contactEmail: "ray.delgado@example.com",
    atDeliveryAddress: true,
    newAddress: null,
    stillOwns: true,
    denialReason:
      "Law tag removed — outside the guarantee's like-new condition terms.",
    raNumber: raNumberDaysAgo(10, "B9SL"),
    trackingNumber: "RAP-G7VKTP36",
    submittedAt: isoTimestampDaysAgo(10),
    reviewedAt: isoTimestampDaysAgo(8),
    createdAt: isoTimestampDaysAgo(11),
    updatedAt: isoTimestampDaysAgo(8),
  },
  {
    // v3 (M-S1): a submitted ANONYMOUS claim — no guarantee link, no RA, no
    // tracking number; the CG claim number is the single reference. Gives the
    // admin desk an unlinked claim to render (M-S4). Osborne matches no seeded
    // guarantee, so auto-match correctly leaves it unlinked.
    id: "seed-claim-osborne",
    guaranteeId: null,
    dealerLocationId: DEFAULT_DEALER_LOCATION_ID,
    status: "submitted",
    step: "submitted",
    confirmations: [...CONFIRMATION_KEYS],
    preVerified: false,
    claimNumber: "CG7MKQ42",
    firstName: "Terri",
    lastName: "Osborne",
    deliveryZip: "28105",
    salesOrderNumber: "1011099600S",
    modelNumber: "PL-2290",
    purchaseDate: isoDaysAgo(46),
    deliveryDate: isoDaysAgo(44),
    protectorUsed: true,
    // journeyDay(deliveryDate) at the submit 4 days ago: 44 - 4 = day 40.
    daysInServiceAtSubmit: 40,
    earlyPreference: null,
    reasonExperience:
      "Softer than expected around the edges and I roll toward the middle.",
    preferredReplacement: "Something with firmer edge support.",
    contactPhone: "7045551340",
    contactPhoneKind: "mobile",
    contactEmail: "terri.osborne@example.com",
    atDeliveryAddress: null,
    newAddress: null,
    stillOwns: null,
    raNumber: null,
    trackingNumber: null,
    submittedAt: isoTimestampDaysAgo(4),
    createdAt: isoTimestampDaysAgo(4),
    updatedAt: isoTimestampDaysAgo(4),
  },
];

/**
 * A few staff notes across the seeded requests, so the dealer <-> RAP thread on
 * the staff detail page isn't empty out of the box. Non-internal (the shared
 * thread both roles read); authorId null — there are no real accounts in the
 * fallback, so the role is stamped directly (see ClaimNote.author).
 */
export const SEED_CLAIM_NOTES: ClaimNote[] = [
  {
    // Boyd is in review — RAP thinking out loud to the dealer.
    id: "seed-claim-note-boyd-1",
    claimId: "seed-claim-boyd",
    authorId: null,
    author: "rap_admin",
    body: "Photos look complete and the law tag is legible. Reviewing against the like-new terms.",
    isInternal: false,
    createdAt: isoTimestampDaysAgo(4),
  },
  {
    // Natarajan is approved — the adjudication answer, on the record.
    id: "seed-claim-note-natarajan-1",
    claimId: "seed-claim-natarajan",
    authorId: null,
    author: "rap_admin",
    body: "Approved — credit $1,499.99 toward the replacement. Dealer to schedule the exchange.",
    isInternal: false,
    createdAt: isoTimestampDaysAgo(7),
  },
  {
    // Kowalski is dealer_scheduled — the dealer confirming the calendar.
    id: "seed-claim-note-kowalski-1",
    claimId: "seed-claim-kowalski",
    authorId: null,
    author: "dealer",
    body: "Customer called to schedule — exchange set for Thursday morning, both partners present.",
    isInternal: false,
    createdAt: isoTimestampDaysAgo(5),
  },
];

/**
 * The mattresses on those seeded requests — the shape saveClaimItems produces.
 * Kowalski's split king carries two (the PRD's max); everyone else has one.
 */
export const SEED_CLAIM_ITEMS: ClaimItem[] = [
  {
    id: "seed-claim-item-calloway-1",
    claimId: "seed-claim-calloway",
    modelNumber: "SP-2214",
    notSoiled: true,
    noOdors: true,
    notDamaged: true,
    position: 0,
    createdAt: isoTimestampDaysAgo(3),
  },
  {
    id: "seed-claim-item-boyd-1",
    claimId: "seed-claim-boyd",
    modelNumber: "PS-8871",
    notSoiled: true,
    noOdors: true,
    notDamaged: true,
    position: 0,
    createdAt: isoTimestampDaysAgo(7),
  },
  {
    id: "seed-claim-item-natarajan-1",
    claimId: "seed-claim-natarajan",
    modelNumber: "ES-4402",
    notSoiled: true,
    noOdors: true,
    notDamaged: true,
    position: 0,
    createdAt: isoTimestampDaysAgo(13),
  },
  {
    id: "seed-claim-item-kowalski-1",
    claimId: "seed-claim-kowalski",
    modelNumber: "BH-3320",
    notSoiled: true,
    noOdors: true,
    notDamaged: true,
    position: 0,
    createdAt: isoTimestampDaysAgo(17),
  },
  {
    id: "seed-claim-item-kowalski-2",
    claimId: "seed-claim-kowalski",
    modelNumber: "BH-3321",
    notSoiled: true,
    noOdors: true,
    notDamaged: true,
    position: 1,
    createdAt: isoTimestampDaysAgo(17),
  },
  {
    id: "seed-claim-item-simmons-1",
    claimId: "seed-claim-simmons",
    modelNumber: "CJ-5583",
    notSoiled: true,
    noOdors: true,
    notDamaged: true,
    position: 0,
    createdAt: isoTimestampDaysAgo(31),
  },
  {
    id: "seed-claim-item-delgado-1",
    claimId: "seed-claim-delgado",
    modelNumber: "IC-1108",
    notSoiled: true,
    noOdors: true,
    notDamaged: true,
    position: 0,
    createdAt: isoTimestampDaysAgo(11),
  },
];
