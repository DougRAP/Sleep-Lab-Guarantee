// content/guarantee-terms.ts
//
// DRAFT terms — master agent finalizes verbatim from the signed PDF at review.
//
// The 90-Night Comfort Guarantee, as a versioned content layer (PRD v2 §"Content").
// Rendered on /guarantee. Copy is drafted faithfully from the signed 90-Night
// agreement's sections; dealer-specific figures (comfort exchange fee,
// territory, governing law) are surfaced as constants so one edit updates the
// page. Fee figures reconciled against the final signed guarantee (2026-07-22).
// Nothing here is legal advice or a substitute for the executed agreement — Doug
// (RAP) reconciles this wording against the signed PDF before launch.

import { COMFORT_EXCHANGE_FEE, WINDOW_OPEN_DAY, WINDOW_CLOSE_DAY } from "../lib/eligibility";

export interface GuaranteeSection {
  id: string;
  heading: string;
  /** Body paragraphs, rendered in order. */
  body?: string[];
  /** Optional bullet list, rendered under the body. */
  items?: string[];
}

/** Program-level facts referenced across the terms and the eligibility copy. */
export const GUARANTEE_META = {
  version: "2026-07",
  name: "RAP 90-Night Comfort Guarantee",
  comfortExchangeFee: COMFORT_EXCHANGE_FEE,
  windowOpenDay: WINDOW_OPEN_DAY,
  windowCloseDay: WINDOW_CLOSE_DAY,
  governingState: "Florida",
  governingCounty: "Palm Beach County",
  // The authoritative guarantee, hosted by Doug (received 2026-07-23). No
  // in-app signing. TEMPORARY dependency on his Netlify: the source HTML has
  // been requested so the document can live in this repo instead.
  fullTermsUrl: "https://rap-citymattress-90daycomfort.netlify.app/",
} as const;

/** Short plain-language essentials shown in-app; the full terms live at fullTermsUrl. */
export const GUARANTEE_ESSENTIALS: string[] = [
  `A one-time comfort exchange, available days ${WINDOW_OPEN_DAY}–${WINDOW_CLOSE_DAY} of your 90 nights.`,
  "Give your new mattress four to six weeks to settle in before deciding.",
  "Exchange for a set of equal or greater value; you pay any price difference at the dealer.",
  `A $${COMFORT_EXCHANGE_FEE} comfort exchange fee applies. No refunds or cash back.`,
  "Both sleep partners choose the replacement together, in-store.",
  "The mattress must be clean and undamaged, with the law and model tags attached.",
  "Covers comfort only — damage or defects are handled separately by your dealer.",
  "Valid in the US, through your original dealer.",
];

export const GUARANTEE_TERMS: GuaranteeSection[] = [
  {
    id: "parties",
    heading: "Parties",
    body: [
      "This 90-Night Comfort Guarantee is provided and administered by RAP (“RAP,” the guarantor). RAP determines eligibility and authorizes each comfort exchange.",
      "Your dealer performs the exchange in-store only after RAP has authorized it. The dealer does not decide eligibility, and no exchange is final until RAP has approved it.",
    ],
  },
  {
    id: "registration",
    heading: "Registration & proof of purchase",
    body: [
      "Your guarantee is registered to the mattress set on your original sales order. RAP must have valid proof of purchase on file for the set you want to exchange.",
      "The person requesting the exchange must be the original purchaser, and the mattress must be the one delivered under that sales order.",
    ],
  },
  {
    id: "the-guarantee",
    heading: "The guarantee",
    body: [
      "A new mattress can feel unfamiliar at first. We ask that you give your body time to adjust — four to six weeks — before deciding whether the comfort is right for you.",
      `If, after that adjustment period, the mattress still isn’t comfortable for you, the Comfort Guarantee lets you make a one-time exchange for a different model between day ${WINDOW_OPEN_DAY} and day ${WINDOW_CLOSE_DAY} of the 90-night period.`,
    ],
  },
  {
    id: "how-it-works",
    heading: "How it works",
    body: [
      `The comfort exchange is a one-time exchange available during days ${WINDOW_OPEN_DAY}–${WINDOW_CLOSE_DAY}. Once you exchange, the guarantee is fulfilled and does not carry to the replacement.`,
    ],
    items: [
      "You select a replacement of equal or greater value; you pay any price difference at the dealer.",
      `A $${COMFORT_EXCHANGE_FEE} comfort exchange fee applies at the time of exchange. It includes delivery and pickup within 50 miles of an authorized location.`,
      "California King sets carry a separate restocking fee, paid to the dealer before the exchange.",
      "The exchange is a mattress swap only — there are no refunds and no cash back.",
      "Both sleep partners should be present in-store to select the replacement together.",
      "The mattress must be returned in like-new, clean, and sanitary condition.",
      "The law tag and the model label must remain attached, legible, and unaltered — removing or defacing either voids the guarantee.",
      "A waterproof mattress protector is strongly recommended from day one; staining or soiling can disqualify the exchange.",
    ],
  },
  {
    id: "not-included",
    heading: "What is not included",
    body: [
      "The Comfort Guarantee covers comfort preference only — it is here for when a mattress simply doesn’t feel right for you.",
      "It is not a warranty and does not cover manufacturing defects. Defect and warranty matters are handled separately by the manufacturer or your dealer.",
      "Adjustable bases, frames, pillows, protectors, and other accessories are not included in the exchange and are non-returnable under this guarantee.",
    ],
  },
  {
    id: "conditions",
    heading: "Conditions & limitations",
    items: [
      "One comfort exchange per original mattress set.",
      `The request, RAP’s authorization, selection, and completion must all fall within days ${WINDOW_OPEN_DAY}–${WINDOW_CLOSE_DAY}.`,
      "The replacement must be in stock and of equal or greater value; the credit excludes taxes, delivery, financing, and accessories.",
      "RAP authorizes every exchange before the dealer completes it.",
      "The mattress must remain in like-new, sanitary condition with tags intact.",
    ],
  },
  {
    id: "important-terms",
    heading: "Important terms",
    items: [
      "This guarantee is tied to the original purchaser and set; it cannot be transferred or assigned.",
      "It has no cash value and may not be redeemed for money.",
      "Misrepresentation, tampering, or fraud voids the guarantee.",
      "Available in the United States only, through the original dealer and location.",
      "This is a comfort guarantee, not a service contract, insurance policy, or warranty.",
    ],
  },
  {
    id: "maximum-obligation",
    heading: "RAP’s maximum obligation",
    body: [
      "RAP’s entire obligation under this guarantee is limited to authorizing the single one-time comfort exchange described above, subject to the comfort exchange fee and any price difference.",
      "RAP is not responsible for incidental, consequential, or other indirect costs, and its total liability will not exceed the original purchase price of the mattress.",
    ],
  },
  {
    id: "class-action-waiver",
    heading: "Class action waiver",
    body: [
      "To the extent permitted by law, any dispute relating to this guarantee will be resolved on an individual basis. You and RAP waive any right to bring or participate in a class, collective, or representative action.",
    ],
  },
  {
    id: "governing-law",
    heading: "Governing law",
    body: [
      "This guarantee is governed by the laws of the State of Florida. Any dispute will be venued in Palm Beach County, Florida.",
    ],
  },
  {
    id: "severability",
    heading: "Severability",
    body: [
      "If any provision of this guarantee is found unenforceable, the remaining provisions stay in full force and effect.",
    ],
  },
];
