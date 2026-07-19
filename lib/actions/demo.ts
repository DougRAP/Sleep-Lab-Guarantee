// lib/actions/demo.ts
// Server actions for the demo day-jumper. Writes only the demo cookie; no record
// is ever mutated. Every action is a no-op when demo mode is off.

"use server";

import { revalidatePath } from "next/cache";
import { isDemoMode, parseDemoDay } from "../demo";
import { clearDemoDay, setDemoDay } from "../demo-server";

export type DemoDayResult = { ok: true; day: number | null } | { ok: false };

export async function previewDay(raw: string | number): Promise<DemoDayResult> {
  if (!isDemoMode()) return { ok: false };
  const day = parseDemoDay(raw);
  if (day === null) return { ok: false };
  await setDemoDay(day);
  revalidatePath("/", "layout");
  return { ok: true, day };
}

export async function clearPreviewDay(): Promise<DemoDayResult> {
  if (!isDemoMode()) return { ok: false };
  await clearDemoDay();
  revalidatePath("/", "layout");
  return { ok: true, day: null };
}
