/**
 * The draft-ready toast's rules (Story 3.8), pure: the page session, which drafts are new
 * and the stack on screen. `DraftReadyNotifier` holds one session per page load.
 */

/** How often the notifier asks the server for ready drafts. */
export const DRAFT_READY_POLL_MS = 15_000;
/** How long a toast stays when nobody hovers or focuses it. */
export const DRAFT_READY_TOAST_MS = 10_000;
/** The most toasts on screen at once; an older one makes room for a newer one. */
export const DRAFT_READY_MAX_TOASTS = 3;

/** A ready draft as the server action returns it. */
export interface ReadyDraftNotice {
  id: string;
  name: string;
  readyAt: string;
}

/**
 * One page session: drafts that became ready after `since` are announced, each once
 * (`seen`). A new page load starts a new session from that moment, so nothing that was
 * ready before is replayed. `errorLogged`: a failed poll is logged once per session.
 */
export interface DraftReadySession {
  since: string;
  seen: Set<string>;
  errorLogged: boolean;
}

/** A session starting at `startedAt` (an ISO timestamp, the server's clock where possible). */
export function startDraftReadySession(startedAt: string): DraftReadySession {
  return { since: startedAt, seen: new Set(), errorLogged: false };
}

/**
 * The drafts of `polled` to show now: not announced yet in `session`, oldest first, each
 * once, at most `max`. Only those are marked seen; any beyond `max` stay unseen and come
 * back on the next poll. A draft for which `isOpen` is true (its case is the page already
 * open) is marked seen without being shown.
 */
export function takeNewDrafts(
  session: DraftReadySession,
  polled: readonly ReadyDraftNotice[],
  max = DRAFT_READY_MAX_TOASTS,
  isOpen: (id: string) => boolean = () => false,
): ReadyDraftNotice[] {
  const fresh: ReadyDraftNotice[] = [];
  for (const draft of [...polled].sort((a, b) => Date.parse(a.readyAt) - Date.parse(b.readyAt))) {
    if (session.seen.has(draft.id)) continue;
    if (isOpen(draft.id)) {
      session.seen.add(draft.id);
      continue;
    }
    if (fresh.length >= max) continue;
    session.seen.add(draft.id);
    fresh.push(draft);
  }
  return fresh;
}

/**
 * The toast stack after `incoming` arrive: newest at the bottom (last), no id twice, at
 * most `max`, the oldest leaving first.
 */
export function stackToasts<T extends { id: string }>(current: readonly T[], incoming: readonly T[], max = DRAFT_READY_MAX_TOASTS): T[] {
  const ids = new Set(incoming.map((t) => t.id));
  const merged = [...current.filter((t) => !ids.has(t.id)), ...incoming];
  return merged.slice(Math.max(0, merged.length - max));
}
