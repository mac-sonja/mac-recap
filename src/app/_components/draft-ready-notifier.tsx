"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type FocusEvent } from "react";
import { PRESSABLE } from "@/app/_components/button-styles";
import { listReadyDrafts } from "@/app/_lib/draft-ready-actions";
import {
  DRAFT_READY_POLL_MS,
  DRAFT_READY_TOAST_MS,
  stackToasts,
  startDraftReadySession,
  takeNewDrafts,
  type DraftReadySession,
  type ReadyDraftNotice,
} from "@/app/_lib/draft-ready";
import { configuratorHref } from "@/app/_lib/routes";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";

const copy = it.draftReady;

/**
 * The page session (Story 3.8): one per page load, kept across client navigation, so moving
 * between the tool pages, the wizard and the configurator neither replays a toast nor misses
 * a draft. The toasts on screen are kept the same way.
 */
let session: DraftReadySession | null = null;
let onScreen: ReadyDraftNotice[] = [];

/** A failed poll is logged once per session and never shown; the next interval tries again. */
function logPollFailure(current: DraftReadySession, reason: string) {
  if (current.errorLogged) return;
  current.errorLogged = true;
  console.warn(`Draft-ready poll failed (${reason}); retrying every ${DRAFT_READY_POLL_MS / 1000} s.`);
}

/**
 * Tells the person, wherever they are in the app, when a case they started generating
 * reaches Da approvare (Story 3.8): every 15 seconds it asks the server for their drafts
 * that became ready since this page session began, and shows one toast per case, newest at
 * the bottom, at most three. Polling pauses while the tab is hidden and asks once when it is
 * shown again. Mount it only for a role that may `generate`. `startedAt` is the server's
 * time when the page was rendered; the first mounted notifier starts the session with it.
 */
export function DraftReadyNotifier({ startedAt }: { startedAt: string }) {
  const [toasts, setToasts] = useState<ReadyDraftNotice[]>(() => onScreen);
  const startedAtRef = useRef(startedAt);

  useEffect(() => {
    onScreen = toasts;
  }, [toasts]);

  useEffect(() => {
    session ??= startDraftReadySession(startedAtRef.current);
    const current = session;
    let timer: ReturnType<typeof setInterval> | null = null;
    let inFlight = false;
    let disposed = false;

    const poll = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const result = await listReadyDrafts({ since: current.since });
        // Unmounted meanwhile: leave them unseen for the next notifier.
        if (disposed) return;
        if (!result.ok) {
          logPollFailure(current, result.error.code);
          return;
        }
        const fresh = takeNewDrafts(current, result.value);
        if (fresh.length > 0) setToasts((shown) => stackToasts(shown, fresh));
      } catch {
        logPollFailure(current, "network");
      } finally {
        inFlight = false;
      }
    };
    const start = () => {
      timer ??= setInterval(() => void poll(), DRAFT_READY_POLL_MS);
    };
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        stop();
      } else if (timer === null) {
        void poll();
        start();
      }
    };

    if (document.visibilityState !== "hidden") start();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      disposed = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const close = (id: string) => setToasts((shown) => shown.filter((t) => t.id !== id));

  return (
    <section
      aria-label={copy.region}
      className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(380px,calc(100vw-32px))] flex-col gap-2"
    >
      {toasts.map((toast) => (
        <DraftReadyToast key={toast.id} toast={toast} onClose={() => close(toast.id)} />
      ))}
    </section>
  );
}

/**
 * One toast: announced politely, never taking focus. It closes by itself after 10 seconds,
 * paused while the pointer is over it or focus is inside it; **Apri** opens the case's
 * configurator and closes it.
 */
function DraftReadyToast({ toast, onClose }: { toast: ReadyDraftNotice; onClose: () => void }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  // The message fills in just after the live region exists, so screen readers announce it.
  const [announced, setAnnounced] = useState(false);
  const messageId = useId();
  const remaining = useRef(DRAFT_READY_TOAST_MS);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const timer = setTimeout(() => setAnnounced(true), 0);
    return () => clearTimeout(timer);
  }, []);

  const paused = hovered || focused;
  useEffect(() => {
    if (paused) return;
    const resumedAt = Date.now();
    const timer = setTimeout(() => onCloseRef.current(), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - resumedAt));
    };
  }, [paused]);

  const title = fill(copy.title, { name: toast.name });
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
  };

  return (
    <div
      data-testid="draft-ready-toast"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={onBlur}
      className="pointer-events-auto flex items-center gap-3 rounded-lg bg-surface-inverse py-3 pr-2 pl-4 text-surface-inverse-foreground shadow-popover motion-safe:animate-enter motion-reduce:animate-none"
    >
      <p id={messageId} role="status" aria-live="polite" aria-atomic="true" className="min-w-0 flex-1 font-body text-sm">
        {announced ? title : ""}
      </p>
      <Link
        href={configuratorHref(toast.id)}
        onClick={onClose}
        aria-describedby={messageId}
        className={cn(
          "inline-flex h-7 shrink-0 items-center rounded-full bg-surface-inverse-foreground px-3 font-label text-[13px] font-semibold text-surface-inverse",
          PRESSABLE,
        )}
      >
        {copy.open}
      </Link>
      <button
        type="button"
        onClick={onClose}
        aria-label={copy.close}
        className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-full hover:bg-surface-inverse-foreground/10", PRESSABLE)}
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
