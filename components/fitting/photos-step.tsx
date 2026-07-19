"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ConciergeCard } from "../concierge-card";
import { Button } from "../ui/button";
import { StillNeeded } from "./still-needed";
import { downscaleImage } from "./downscale";
import { capturePhoto, finishPhotos } from "../../lib/actions/fitting";
import { cn } from "../../lib/utils";
import type { PhotoAngle } from "../../lib/types";

export interface PhotoTargetView {
  angle: PhotoAngle;
  label: string;
  coaching: string;
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
 * Step 4 — the photos. Each target is a labeled tap-to-capture tile using the
 * device camera. Once captured it shows a thumbnail and a calm "Retake".
 *
 * Storage degrades gracefully: with Supabase configured the bytes are uploaded;
 * with no Supabase env the capture is kept in-session (the thumbnail is a local
 * object URL) and only the metadata is recorded — the request still completes.
 */
export function PhotosStep({
  targets,
  capturedAngles,
  storageConfigured,
  onDone,
}: {
  targets: PhotoTargetView[];
  capturedAngles: PhotoAngle[];
  storageConfigured: boolean;
  onDone: () => void;
}) {
  const [captured, setCaptured] = useState<Set<PhotoAngle>>(new Set(capturedAngles));
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<PhotoAngle | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Object URLs are session-scoped; release them when the step unmounts.
  const thumbsRef = useRef(thumbs);
  thumbsRef.current = thumbs;
  useEffect(
    () => () => {
      Object.values(thumbsRef.current).forEach((url) => URL.revokeObjectURL(url));
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
        if (t[target.angle]) URL.revokeObjectURL(t[target.angle]);
        return { ...t, [target.angle]: url };
      });

      const form = new FormData();
      form.set("angle", target.angle);
      form.set("fileName", prepared.name);
      // With no storage backend there is nowhere to put the bytes — send only
      // the metadata rather than pushing megabytes at a server that will drop
      // them. The thumbnail above keeps the capture visible for the session.
      if (storageConfigured) form.set("file", prepared);

      const res = await capturePhoto(form);
      if (res.ok) {
        setCaptured((c) => new Set(c).add(target.angle));
      } else {
        setNote(res.error);
      }
    } finally {
      setBusy(null);
    }
  }

  const missing = targets.filter((t) => !captured.has(t.angle));
  const ready = missing.length === 0;

  function submit() {
    if (!ready || pending) return;
    startTransition(async () => {
      const res = await finishPhotos();
      if (res.ok) onDone();
      else setNote(res.error);
    });
  }

  return (
    <div className="space-y-6">
      <ConciergeCard>
        Let&apos;s take a look together. Sheets off for the mattress shots — I&apos;ll
        tell you what each one is as we go.
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
              <label className="flex cursor-pointer items-center gap-3">
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
                    {done && <span className="ml-2 text-dawn">&mdash; captured</span>}
                  </span>
                  <span className="mt-1 block text-[14px] leading-snug text-cloud/90">
                    {target.coaching}
                  </span>
                </span>

                <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.12em] text-mist">
                  {busy === target.angle ? "…" : done ? "Retake" : "Take"}
                </span>

                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  aria-label={`${target.label} — ${target.coaching}`}
                  onChange={(e) => {
                    void onPick(target, e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          );
        })}
      </div>

      <StillNeeded items={missing.map((t) => t.label)} />

      {note && <p className="text-[13px] text-mist">{note}</p>}

      <Button onClick={submit} disabled={!ready || pending}>
        Next — your details
      </Button>
    </div>
  );
}
