"use client";

import { useState } from "react";
import { cn } from "@/shared/utils";

/**
 * A client logo on a small white tile, so dark logos with a transparent
 * background stay visible on the black UI (owner, 2026-10-16). If the image
 * fails to load (e.g. its signed URL expired), the whole tile is hidden rather
 * than showing a broken image.
 */
export function LogoTile({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  if (brokenSrc === src) return null;
  return (
    <div className={cn("flex shrink-0 items-center justify-center rounded-md bg-logo-tile p-2", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} onError={() => setBrokenSrc(src)} className="max-h-full max-w-full object-contain" />
    </div>
  );
}
