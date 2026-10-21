"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/shared/utils";

/**
 * A client logo on a small white tile, so dark logos with a transparent
 * background stay visible on the dark UI and visible on the light one (owner, 2026-10-16). If the image
 * fails to load (e.g. its signed URL expired), the whole tile is replaced by
 * `fallback` (nothing by default) rather than showing a broken image. A
 * `decorative` tile (with `alt=""`) is hidden from screen readers.
 */
export function LogoTile({
  src,
  alt,
  className,
  fallback = null,
  decorative = false,
}: {
  src: string;
  alt: string;
  className?: string;
  fallback?: ReactNode;
  decorative?: boolean;
}) {
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  if (brokenSrc === src) return fallback;
  return (
    <div
      aria-hidden={decorative ? true : undefined}
      className={cn("flex shrink-0 items-center justify-center rounded-lg bg-logo-tile p-2 shadow-card", className)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} onError={() => setBrokenSrc(src)} className="max-h-full max-w-full object-contain" />
    </div>
  );
}
