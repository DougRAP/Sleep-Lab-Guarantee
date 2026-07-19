// content/shop.ts
//
// Curated accessories for the Shop tab (#6) — a versioned content layer, not a
// store. Lead-gen only: each item links out to the dealer/store, and the dealer
// coupon (from dealer_locations) is applied at their checkout. No cart, no
// Stripe. Keep the list short and calm; the waterproof protector is first
// because the Comfort Guarantee recommends one from day one.
//
// PLACEHOLDER links (example.com) until real product URLs are provided.

export interface ShopItem {
  id: string;
  name: string;
  /** One short, calm line — no marketing exclamation. */
  blurb: string;
  /** External product/store URL. Opened in a new tab with rel="noopener". */
  url: string;
  /** Why it belongs here / how the coupon applies. */
  note: string;
}

export const SHOP_ITEMS: ShopItem[] = [
  {
    id: "waterproof-protector",
    name: "Waterproof mattress protector",
    blurb:
      "Breathable, quiet, and machine-washable — it keeps the set clean and sanitary so your Comfort Guarantee stays intact.",
    url: "https://example.com/shop/waterproof-mattress-protector",
    note: "Recommended from night one. Your dealer coupon applies at checkout.",
  },
  {
    id: "down-alternative-pillow",
    name: "Down-alternative pillow",
    blurb:
      "A medium-loft pillow that pairs well with most new mattresses while your body settles in.",
    url: "https://example.com/shop/down-alternative-pillow",
    note: "Add it to your order and use your dealer coupon at checkout.",
  },
  {
    id: "cotton-sheet-set",
    name: "Cotton percale sheet set",
    blurb:
      "Cool, crisp, and simple — a calm foundation for the first nights on a new surface.",
    url: "https://example.com/shop/cotton-percale-sheet-set",
    note: "Your dealer coupon applies at checkout.",
  },
];
