"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ConciergeCard } from "../concierge-card";
import { Button } from "../ui/button";
import { StepActions } from "../ui/step-actions";
import { StillNeeded } from "./still-needed";
import { downscaleImage } from "./downscale";
import { capturePhoto, finishPhotos } from "../../lib/actions/fitting";
import { cn } from "../../lib/utils";
import type { PhotoAngle } from "../../lib/types";

export interface PhotoTargetView {
  angle: PhotoAngle;
  label: string;
  coaching: string;
  /** Welcome but never blocks the request (the receipt, review 2026-07-22). */
  optional?: boolean;
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </svg>
  );
}

/**
 * Step 4 — the photos. Each target is a labeled tile with BOTH capture paths:
 * Camera (input with `capture`) and Gallery (input without), because the OS
 * chooser alone is inconsistent across platforms. Once captured it shows a
 * thumbnail and a calm "Retake".
 *
 * Storage degrades gracefully: with Supabase configured the bytes are uploaded;
 * with no Supabase env the capture is kept in-session (the thumbnail is a local
 * object URL) and only the metadata is recorded — the request still completes.
 */
export function PhotosStep({
  targets,
  capturedAngles,
  storageConfigured,
  initialThumbs,
  onBack,
  onDone,
  onCaptured,
  capture = capturePhoto,
  finish = finishPhotos,
  intro,
  nextLabel = "Next — your details",
}: {
  targets: PhotoTargetView[];
  capturedAngles: PhotoAngle[];
  storageConfigured: boolean;
  /** Server-signed URLs for already-persisted photos, so navigating away and
   *  back shows the captures instead of an empty "Retake" tile. */
  initialThumbs?: Partial<Record<PhotoAngle, string>>;
  /** Absent when the flow has nowhere to go back to from this step. */
  onBack?: () => void;
  onDone: (captured: PhotoAngle[]) => void;
  /**
   * Fired after each successful capture (v3 /claim). The claim flow keeps the
   * customer's progress in its own state instead of re-reading the server, so
   * it needs to hear about a capture when it happens rather than on submit.
   * The fitting omits it and is unaffected.
   */
  onCaptured?: (captured: PhotoAngle[]) => void;
  /** Injectable actions (v3): the anonymous /claim flow passes its own
   *  claimant-session-scoped pair; the fitting keeps its defaults. */
  capture?: typeof capturePhoto;
  finish?: typeof finishPhotos;
  /** Step intro copy override (v3 uses its own); default is the fitting's. */
  intro?: React.ReactNode;
  nextLabel?: string;
}) {
  const [captured, setCaptured] = useState<Set<PhotoAngle>>(new Set(capturedAngles));
  const [thumbs, setThumbs] = useState<Record<string, string>>(
    () => ({ ...(initialThumbs ?? {}) } as Record<string, string>)
  );
  // iOS's native chooser already offers Take Photo / Photo Library from ONE
  // capture-less input, so a single "Take" is enough there. Android jumps
  // straight to the file picker, so it needs the explicit Camera + Gallery
  // pair. Detected post-mount to keep SSR hydration clean; the two-button
  // layout is the safe default everywhere else.
  const [iosChooser, setIosChooser] = useState(false);
  useEffect(() => {
    const ua = navigator.userAgent;
    const isIOS =
      /iP(hone|ad|od)/.test(ua) ||
      (ua.includes("Mac") && navigator.maxTouchPoints > 1);
    setIosChooser(isIOS);
  }, []);
  const [busy, setBusy] = useState<PhotoAngle | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Object URLs are session-scoped; release them when the step unmounts.
  // Server-signed https thumbs are not ours to revoke.
  const thumbsRef = useRef(thumbs);
  thumbsRef.current = thumbs;
  useEffect(
    () => () => {
      Object.values(thumbsRef.current)
        .filter((url) => url.startsWith("blob:"))
        .forEach((url) => URL.revokeObjectURL(url));
    },
    []
  );

  async function onPick(target: PhotoTargetView, file: File | undefined) {
    if (!file) return;
    setBusy(target.angle);
    setNote(null);
    try {
      const prepared = await downscaleImage(file);

      const url = URL.createObjectURL(prepared);
      setThumbs((t) => {
        if (t[target.angle]?.startsWith("blob:")) URL.revokeObjectURL(t[target.angle]);
        return { ...t, [target.angle]: url };
      });

      const form = new FormData();
      form.set("angle", target.angle);
      form.set("fileName", prepared.name);
      // With no storage backend there is nowhere to put the bytes — send only
      // the metadata rather than pushing megabytes at a server that will drop
      // them. The thumbnail above keeps the capture visible for the session.
      if (storageConfigured) form.set("file", prepared);

      const res = await capture(form);
      if (res.ok) {
        const next = new Set(captured).add(target.angle);
        setCaptured(next);
        onCaptured?.([...next]);
      } else {
        setNote(res.error);
      }
    } finally {
      setBusy(null);
    }
  }

  // Optional targets (the receipt) are offered but never block the step —
  // mirrors photosStatus on the server (review 2026-07-22).
  const missing = targets.filter((t) => !t.optional && !captured.has(t.angle));
  const ready = missing.length === 0;

  function submit() {
    if (!ready || pending) return;
    startTransition(async () => {
      const res = await finish();
      if (res.ok) onDone([...captured]);
      else setNote(res.error);
    });
  }

  return (
    <div className="space-y-6">
      <ConciergeCard>
        {intro ?? (
          <>
            Let&apos;s take a look together. Sheets off for the mattress shots —
            I&apos;ll tell you what each one is as we go.
          </>
        )}
      </ConciergeCard>

      <div className="space-y-2.5">
        {targets.map((target) => {
          const done = captured.has(target.angle);
          const thumb = thumbs[target.angle];
          return (
            <div
              key={target.angle}
              className={cn(
                "rounded-2xl border p-3 transition-colors",
                done ? "border-dawn/40 bg-dawn/[0.06]" : "border-[var(--line)] bg-white/[0.03]"
              )}
            >
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border",
                    done ? "border-dawn/40" : "border-[var(--line)]"
                  )}
                >
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumb}
                      alt={`${target.label} — captured`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <CameraIcon className={cn("h-6 w-6", done ? "text-dawn" : "text-mist")} />
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-[11px] uppercase tracking-[0.12em] text-mist">
                    {target.label}
                    {done ? (
                      <span className="ml-2 text-dawn">&mdash; captured</span>
                    ) : (
                      target.optional && (
                        <span className="ml-2 normal-case tracking-normal text-mist/80">
                          &mdash; optional
                        </span>
                      )
                    )}
                  </span>
                  <span className="mt-1 block text-[14px] leading-snug text-cloud/90">
                    {target.coaching}
                  </span>
                </span>

                {/* BOTH capture paths, explicitly (review follow-up 2026-07-23):
                    relying on the OS chooser is inconsistent — iOS offers
                    camera + library, Android often jumps straight to the
                    gallery. One input WITH `capture` (the camera) and one
                    WITHOUT (the gallery) works everywhere. */}
                <span className="flex shrink-0 flex-col items-end gap-2">
                  {busy === target.angle ? (
                    <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-mist">
                      …
                    </span>
                  ) : iosChooser ? (
                    /* iOS: one tap, the OS sheet offers camera AND library. */
                    <label className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.12em] text-dawn transition-colors hover:brightness-110">
                      {done ? "Retake" : "Take"}
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        aria-label={`${target.label} — take a photo or choose from the library`}
                        onChange={(e) => {
                          void onPick(target, e.target.files?.[0]);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  ) : (
                    /* Android/desktop: both paths, explicitly. */
                    <>
                      <label className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.12em] text-dawn transition-colors hover:brightness-110">
                        {done ? "Retake" : "Camera"}
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="sr-only"
                          aria-label={`${target.label} — take a photo with the camera`}
                          onChange={(e) => {
                            void onPick(target, e.target.files?.[0]);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      <label className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.12em] text-mist transition-colors hover:text-cloud">
                        Gallery
                        <input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          aria-label={`${target.label} — choose from the gallery`}
                          onChange={(e) => {
                            void onPick(target, e.target.files?.[0]);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </>
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <StillNeeded items={missing.map((t) => t.label)} />

      {note && <p className="text-[13px] text-mist">{note}</p>}

      <StepActions onBack={onBack}>
        <Button onClick={submit} disabled={!ready || pending}>
          {nextLabel}
        </Button>
      </StepActions>
    </div>
  );
}
