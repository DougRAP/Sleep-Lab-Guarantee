// lib/storage.ts
// Photo storage for the fitting. Uploads to Supabase Storage when configured;
// with no Supabase env (the current production state) it degrades gracefully —
// the capture is recorded as metadata only (angle, label, file name, timestamp)
// so the flow completes and nothing is lost or blocked.
//
// The rule: storage being absent must never cost the customer their progress.

import type { PhotoAngle } from "./types";

/** Storage bucket for claim photos. Create it (private) alongside the schema. */
export const CLAIM_PHOTO_BUCKET = "claim-photos";

/**
 * True when photo bytes can actually be persisted. Mirrors
 * `isSupabaseConfigured()` but reads the env directly so this module stays free
 * of next/headers and unit-testable.
 */
export function isPhotoStorageConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export interface StoredPhoto {
  /** True when the bytes were persisted; false = metadata-only fallback. */
  stored: boolean;
  /** Path within CLAIM_PHOTO_BUCKET, or null in the fallback. */
  storagePath: string | null;
}

/** Deterministic object path: one folder per claim, one object per angle. */
export function claimPhotoPath(
  claimId: string,
  angle: PhotoAngle,
  extension = "jpg"
): string {
  const safeExt = extension.replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
  return `${claimId}/${angle}.${safeExt}`;
}

function extensionFor(contentType: string | undefined, fileName?: string | null): string {
  if (fileName && /\.[a-z0-9]{2,5}$/i.test(fileName)) {
    return fileName.split(".").pop()!.toLowerCase();
  }
  if (contentType?.includes("png")) return "png";
  if (contentType?.includes("webp")) return "webp";
  if (contentType?.includes("heic")) return "heic";
  return "jpg";
}

export interface UploadInput {
  claimId: string;
  angle: PhotoAngle;
  bytes: ArrayBuffer | Uint8Array;
  contentType?: string;
  fileName?: string | null;
}

/**
 * Persist a captured photo. Returns `{ stored: false, storagePath: null }`
 * whenever storage is unavailable or the upload fails — the caller records the
 * capture either way, so submission is never blocked by storage.
 */
export async function uploadClaimPhoto(input: UploadInput): Promise<StoredPhoto> {
  if (!isPhotoStorageConfigured()) return { stored: false, storagePath: null };

  const ext = extensionFor(input.contentType, input.fileName);
  const path = claimPhotoPath(input.claimId, input.angle, ext);

  try {
    const { createServiceClient } = await import("./supabase/server");
    const db = createServiceClient();
    const body =
      input.bytes instanceof Uint8Array ? input.bytes : new Uint8Array(input.bytes);
    const { error } = await db.storage
      .from(CLAIM_PHOTO_BUCKET)
      .upload(path, body, {
        contentType: input.contentType || "image/jpeg",
        upsert: true,
      });
    if (error) return { stored: false, storagePath: null };
    return { stored: true, storagePath: path };
  } catch {
    // Missing bucket, network, bad key — degrade to metadata-only.
    return { stored: false, storagePath: null };
  }
}
