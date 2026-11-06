"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, type FocusEvent, type MouseEvent } from "react";
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
import { clientHref, configuratorHref } from "@/app/_lib/routes";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";

const copy = it.draftReady;

/** Whether a ready draft is a client's intro (Story 3.11): its toast opens the client page. */
const isIntro = (draft: ReadyDraftNotice) => draft.kind === "client_intro";
/** What a toast says: the case's name, or the client's intro. */
const titleOf = (draft: ReadyDraftNotice) => fill(isIntro(draft) ? copy.introTitle : copy.title, { name: draft.name });
/** Where **Apri** goes: the case's configurator, or the client's page for an intro (until Story 4.11). */
const hrefOf = (draft: ReadyDraftNotice) => (isIntro(draft) ? clientHref(draft.id) : configuratorHref(draft.id));

/** The wizard's path; with `?caseId=` it is that case's page (its generating screen while it generates). */
const WIZARD_PATH = "/case-studies/new";

/*
 * The page session (Story 3.8): one per page load, kept at module level across client
 * navigation, so moving between the tool pages, the wizard and the configurator (each layout
 * mounts its own notifier) neither replays nor re-announces a toast, nor restarts a toast's
 * 10 seconds or the 15-second poll. Only a new page load starts over.
 */
let session: DraftReadySession | null = null;
/** The toasts on screen. */
let onScreen: ReadyDraftNotice[] = [];
/** Each toast's time left before it closes by itself, by case id. */
const timeLeft = new Map<string, number>();
/** When the last poll started (ms); the session start before the first one. */
let lastPollAt = 0;
/** Set after a 401 or 403: this person can't be told, so the session stops asking. */
let stopped = false;

/** A failed poll is logged once per session and never shown; the next interval tries again. */
function logPollFailure(current: DraftReadySession, reason: string) {
  if (current.errorLogged) return;
  current.errorLogged = true;
  console.warn(`Draft-ready poll failed (${reason}); retrying every ${DRAFT_READY_POLL_MS / 1000} s.`);
}

/** Whether a click on a link is a plain primary click that navigates in this tab. */
const isPlainClick = (event: MouseEvent) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

/**
 * Tells the person, wherever they are in the app, when a case they started generating
 * reaches Da approvare (Story 3.8), or a client's intro their save started (Story 3.11; its
 * toast opens the client page): every 15 seconds it asks the server for their drafts
 * that became ready since this page session began, and shows one toast per case, newest at
 * the bottom, at most three. One persistent, visually hidden live region announces each new
 * toast politely; focus never moves. A draft whose case is the page already open (its
 * generating screen or its configurator) gets no toast. Polling pauses while the tab is
 * hidden, asks once when it is shown again, and stops after a 401 or 403. Mount it only for a
 * role that may `generate`. `startedAt` is the server's time when the page was rendered;
 * the first mounted notifier starts the session with it.
 */
export function DraftReadyNotifier({ startedAt }: { startedAt: string }) {
  const [toasts, setToasts] = useState<ReadyDraftNotice[]>(() => onScreen);
  const [announcement, setAnnouncement] = useState("");
  const startedAtRef = useRef(startedAt);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const openCaseRef = useRef<(id: string, kind: "case" | "client_intro") => boolean>(() => false);
  useEffect(() => {
    const wizardCaseId = pathname === WIZARD_PATH ? searchParams?.get("caseId") : null;
    openCaseRef.current = (id, kind) =>
      kind === "client_intro" ? pathname === clientHref(id) : pathname === configuratorHref(id) || wizardCaseId === id;
  });

  useEffect(() => {
    onScreen = toasts;
    for (const id of timeLeft.keys()) if (!toasts.some((t) => t.id === id)) timeLeft.delete(id);
  }, [toasts]);

  useEffect(() => {
    if (session === null) {
      session = startDraftReadySession(startedAtRef.current);
      lastPollAt = Date.now();
    }
    const current = session;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;
    let disposed = false;

    const stop = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };
    const poll = async () => {
      if (inFlight || stopped) return;
      inFlight = true;
      lastPollAt = Date.now();
      try {
        const result = await listReadyDrafts({ since: current.since });
        // Unmounted meanwhile: leave them unseen for the next notifier.
        if (disposed) return;
        if (!result.ok) {
          if (result.status === 401 || result.status === 403) {
            stopped = true;
            stop();
          } else {
            logPollFailure(current, result.error.code);
          }
          return;
        }
        const fresh = takeNewDrafts(current, result.value, undefined, (id, kind) => openCaseRef.current(id, kind));
        if (fresh.length > 0) {
          setToasts((shown) => stackToasts(shown, fresh));
          setAnnouncement(fresh.map(titleOf).join(" "));
        }
      } catch {
        if (!disposed) logPollFailure(current, "network");
      } finally {
        inFlight = false;
      }
    };
    const schedule = (delay: number) => {
      if (stopped) return;
      timer = setTimeout(() => {
        timer = null;
        void poll();
        schedule(DRAFT_READY_POLL_MS);
      }, delay);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        stop();
      } else if (timer === null && !stopped) {
        void poll();
        schedule(DRAFT_READY_POLL_MS);
      }
    };

    // A remount (another layout) keeps the rhythm: poll at once if 15 s have passed, else wait the rest.
    if (document.visibilityState !== "hidden") schedule(Math.max(0, lastPollAt + DRAFT_READY_POLL_MS - Date.now()));
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      disposed = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const close = (id: string) => setToasts((shown) => shown.filter((t) => t.id !== id));

  return (
    <>
      <div role="status" aria-live="polite" aria-atomic="true" data-draft-ready-live="" className="sr-only">
        {announcement}
      </div>
      {toasts.length > 0 && (
        <section
          aria-label={copy.region}
          className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(380px,calc(100vw-32px))] flex-col gap-2"
        >
          {toasts.map((toast) => (
            <DraftReadyToast key={toast.id} toast={toast} onClose={() => close(toast.id)} />
          ))}
        </section>
      )}
    </>
  );
}

/**
 * One toast, never taking focus. It closes by itself after 10 seconds, paused while the
 * pointer is over it or focus is inside it, the time left kept across remounts; **Apri**
 * opens the case's configurator (a client intro's: the client page) and, on a plain click,
 * closes it.
 */
function DraftReadyToast({ toast, onClose }: { toast: ReadyDraftNotice; onClose: () => void }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const messageId = useId();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const paused = hovered || focused;
  useEffect(() => {
    if (paused) return;
    const resumedAt = Date.now();
    const left = timeLeft.get(toast.id) ?? DRAFT_READY_TOAST_MS;
    const timer = setTimeout(() => onCloseRef.current(), left);
    return () => {
      clearTimeout(timer);
      // Paused or remounting: keep what is left (the notifier forgets it once the toast is gone).
      timeLeft.set(toast.id, Math.max(0, left - (Date.now() - resumedAt)));
    };
  }, [paused, toast.id]);

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
      <p id={messageId} className="min-w-0 flex-1 font-body text-sm">
        {titleOf(toast)}
      </p>
      <Link
        href={hrefOf(toast)}
        onClick={(event) => {
          if (isPlainClick(event)) onClose();
        }}
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
