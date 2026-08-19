// lib/auth/owned-guarantees.ts
// The purchases linked to an account, resolved once per request.
//
// R-1 review: the root layout's footer needs to know whether an account has
// anything linked, and so does every page guard, and so does the header's
// purchase switcher. Before this, each asked the repository separately, so
// adding the footer made it three identical queries per consumer page view.
// B-18 was a round-trip-reduction effort; this keeps that ground.
//
// React cache() is per-request and keyed by argument, so the layout and the
// page it wraps share one answer. It never crosses requests. Server-only.

import { cache } from "react";
import { getRepository } from "../data";
import type { Guarantee } from "../types";

export const ownedGuarantees = cache(
  async (userId: string): Promise<Guarantee[]> =>
    getRepository().listGuaranteesForUser(userId)
);
