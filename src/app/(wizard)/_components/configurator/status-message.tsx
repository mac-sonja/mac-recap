"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/shared/utils";

/** How long a message stays at the top of the canvas. */
export const STATUS_MESSAGE_MS = 3500;

/** The message on show and `say`, which shows one (replacing the last) for `STATUS_MESSAGE_MS`. */
export function useStatusMessage(): [string | null, (text: string) => void] {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = useCallback((text: string) => {
    if (timer.current !== null) clearTimeout(timer.current);
    setMessage(text);
    timer.current = setTimeout(() => {
      timer.current = null;
      setMessage(null);
    }, STATUS_MESSAGE_MS);
  }, []);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  return [message, say];
}

/**
 * A message at the top of the canvas (a refusal, a deletion, a copy; here the hint of a
 * tool that isn't here yet), announced to screen readers. Always mounted, so each new
 * text is read out; it fades in from slightly above and out again.
 */
export function StatusMessage({ message }: { message: string | null }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-none absolute top-3 left-1/2 z-20 max-w-[min(560px,calc(100%-32px))] -translate-x-1/2 rounded-lg bg-surface-inverse px-5 py-3 text-center font-label text-sm font-semibold text-surface-inverse-foreground shadow-popover transition-[opacity,transform] duration-200 ease-out",
        message === null ? "-translate-y-2 opacity-0" : "translate-y-0 opacity-100",
      )}
    >
      {message}
    </div>
  );
}
