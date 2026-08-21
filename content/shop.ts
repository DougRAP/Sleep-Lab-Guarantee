// content/shop.ts
//
// Curated accessories for the Shop tab (#6) — a versioned content layer, not a
// store. Lead-gen only: each item links out to the dealer/store, and the dealer
// coupon (from dealer_locations) is applied at their checkout. No cart, no
// Stripe. Keep the list short and calm; the protector is first because the
// Comfort Guarantee recommends one from day one.
//
// Live City Mattress collection links + images, provided by Doug 2026-07-23.

export interface ShopItem {
  id: string;
  name: string;
  /** One short, calm line — no marketing exclamation. */
  blurb: string;
  /** External product/store URL. Opened in a new tab with rel="noopener". */
  url: string;
  /** Why it belongs here / how the coupon applies. */
  note: string;
  /** Local image path (public/), shown atop the card. */
  image?: string;
}

export const SHOP_ITEMS: ShopItem[] = [
  {
    id: "pads-protectors",
    name: "Mattress pads & protectors",
    blurb:
      "A waterproof protector keeps the set clean and sanitary — and your Comfort Guarantee intact.",
    url: "https://www.citymattress.com/collections/pads-protectors",
    note: "Recommended from night one. Your dealer coupon, once you have one, applies at checkout.",
    image: "/shop/protector.webp",
  },
  {
    id: "pillows",
    name: "Pillows",
    blurb:
      "The right pillow does half the work while your body settles into a new surface.",
    url: "https://www.citymattress.com/collections/pillows",
    note: "Add one to your order, and use your dealer coupon at checkout once you have one.",
    image: "/shop/pillows.webp",
  },
  {
    id: "bedroom-furniture",
    name: "Bedroom furniture",
    blurb:
      "Bases, frames, and the rest of the room — a calm foundation for better sleep.",
    url: "https://www.citymattress.com/collections/bedroom-furniture",
    note: "Your dealer coupon, once you have one, applies at checkout.",
    image: "/shop/furn.webp",
  },
];
