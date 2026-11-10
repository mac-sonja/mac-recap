"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActionResult } from "@/app/_lib/action-result";
import type { Page } from "@/modules/generation";
import type { FormatId } from "@/modules/rendering";
import { DEBOUNCE_MS } from "../use-autosave-fields";
import type { SaveState } from "./top-bar";

/** Each registry format's own pages. */
export type Formats = Readonly<Record<FormatId, readonly Page[]>>;

/** The head revision being edited, as the page read it. */
export interface EditedRevision {
  id: string;
  version: number;
  /** A `working` head of an In revisione case, or an Approvato case's head (Story 4.9); otherwise nothing is edited or saved. */
  editable: boolean;
  /**
   * Story 4.9: the head is an Approvato case's approved revision itself, so the first save
   * forks a working copy (`fork`) and saves there; later saves go to the copy.
   */
  fork?: boolean;
}

/**
 * Whose head revision the configurator edits (Story 4.11a): a case, or a client's intro and
 * outro (`id` the intro's own id, `clientId` its client's: the Media tab lists and uploads there).
 */
export type Subject = { kind: "case"; id: string } | { kind: "client_intro"; id: string; clientId: string };

/** How an action names the subject: `caseId` for a case (as before), `clientIntroId` for a client's intro. */
export type SubjectKey = { caseId: string } | { clientIntroId: string };

/** The id field an action takes for `subject`. */
export const subjectKey = (subject: Subject): SubjectKey => (subject.kind === "case" ? { caseId: subject.id } : { clientIntroId: subject.id });

/** What a fork sends (Story 4.9): the subject's id (`subjectKey`; Story 4.11b: an intro too) and the `headVersion` read. */
export type ForkInput = SubjectKey & { expectedHeadVersion: number };

/** What a fork returns: the working copy's id and `version`, and the subject's `headVersion` after it. */
export interface ForkResult {
  revisionId: string;
  version: number;
  headVersion: number;
}

/**
 * What a save sends: the subject's id (`subjectKey`), the whole document (each format as
 * `{ pages }`, as stored), and the version it was based on.
 */
export type SaveInput = SubjectKey & {
  revisionId: string;
  doc: { schemaVersion: number; kind: string; template: string; formats: Readonly<Record<FormatId, { pages: readonly Page[] }>> };
  expectedVersion: number;
};

/** The document shape of `formats`: each format's pages under `pages`. */
const stored = (formats: Formats): SaveInput["doc"]["formats"] =>
  Object.fromEntries(Object.entries(formats).map(([id, pages]) => [id, { pages }])) as SaveInput["doc"]["formats"];

export interface UseDocumentOptions {
  /** Whose head revision is edited (Story 4.11a): a case, or a client's intro (forked as a case is, Story 4.11b). */
  subject: Subject;
  revision: EditedRevision | null;
  /** The document's fields other than its pages, sent back unchanged. */
  base: { schemaVersion: number; kind: string; template: string };
  initial: Formats;
  save: (input: SaveInput) => Promise<ActionResult<{ version: number }>>;
  /** Someone else saved first, or the case can no longer be edited: read it again (no retry). */
  onStale: () => void;
  /** Story 4.9: forks an Approvato case's (Story 4.11b: or intro's) head before its first save (`revision.fork`). */
  fork?: (input: ForkInput) => Promise<ActionResult<ForkResult>>;
  /** The case's `head_version` as read (approval's and the fork's compare-and-set). */
  headVersion?: number;
}

export interface DocumentState {
  formats: Formats;
  save: SaveState;
  /** Three saves in a row failed: *Le modifiche non si salvano.* */
  banner: boolean;
  /** The files the last save was refused for (`ASSET_NOT_ALLOWED`, Story 4.5b); null once a save goes through. */
  refused: readonly string[] | null;
  canUndo: boolean;
  canRedo: boolean;
  /**
   * Records an edit made in `formatId` and saves it after {@link DEBOUNCE_MS}. Changes
   * with the same `group` (one text editing session) make one undo step.
   */
  change: (next: Formats, formatId: FormatId, group?: string) => void;
  /** Saves the latest document now (e.g. when a text editing session ends). */
  flush: () => void;
  /**
   * Saves the latest document now and waits for it (Story 4.8, before approving): true
   * once the server holds exactly what is shown, false when a save failed or the revision
   * went stale.
   */
  settle: () => Promise<boolean>;
  /** The revision `version` the last save returned (or the one read). */
  version: () => number;
  /** The revision saves go to: the one read, or the working copy a fork made (Story 4.9). */
  revisionId: () => string | undefined;
  /** The case's `head_version`: the one read, or the one the fork returned (Story 4.9). */
  headVersion: () => number | undefined;
  /**
   * Story 4.9: the next save forks first (the head is the approved revision). False once a
   * fork made the working copy: the copy is pending, so Aggiorna and Scarta show.
   */
  forkPending: boolean;
  /** Story 4.9: the copy just became the approved revision; the next edit forks again. */
  approved: () => void;
  /** Story 4.9: no more saves or retries (the copy was discarded; the page reloads). */
  stop: () => void;
  /** Undoes or redoes one step and returns the format it changed, or undefined with nothing to do. */
  undo: () => FormatId | undefined;
  redo: () => FormatId | undefined;
}

/** The most undo steps kept. */
export const HISTORY_LIMIT = 100;

/** Waits before the 1st, 2nd and 3rd retry; later retries wait the last value here. */
export const RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 15_000] as const;

/** How long `settle` waits for a save in flight before giving up. */
const SETTLE_TIMEOUT_MS = 30_000;

/** After this many failures in a row the banner shows. */
export const BANNER_AFTER = 3;

/** Refusals a retry of the same document can't fix: no timed retry; the next edit tries again (e.g. a text made shorter). */
const PERMANENT_CODES = new Set(["INVALID_INPUT", "DOCUMENT_INVALID", "DOCUMENT_SCHEMA_UNSUPPORTED", "FORMAT_NOT_IN_REVISION", "ASSET_NOT_ALLOWED", "FORBIDDEN"]);

/** Refusals a retry can't fix because the server holds something newer: read it again instead. */
const STALE_CODES = new Set(["STALE_REVISION", "STALE_HEAD", "REVISION_NOT_WRITABLE", "CASE_NOT_EDITABLE", "NOT_FOUND"]);

/**
 * Whether a fork made a fresh copy (Story 4.9): `fork_head` returns an existing copy as it is,
 * so one with edits (`version` > 0) or a head that moved by more than this fork belongs to
 * someone else's session.
 */
const createdByThisFork = (forked: ForkResult, expected: number) => forked.version === 0 && forked.headVersion === expected + 1;

interface Step {
  formats: Formats;
  /** The format the step changed, shown again when it is undone or redone. */
  formatId: FormatId;
}

/**
 * The configurator's document (Story 4.3a): every format's pages, the undo history and
 * the autosave. Saves run one at a time, each sending the whole document with the
 * `version` the last save returned (compare-and-set); edits made meanwhile are saved
 * right after. A failed save shows *Non salvato. Nuovo tentativo…* and retries after
 * {@link RETRY_DELAYS_MS}; after {@link BANNER_AFTER} failures the banner shows until a
 * save goes through. A stale save is never retried: `onStale` reloads. An undo or redo
 * saves like any edit. Nothing is saved for a revision that isn't editable.
 *
 * Story 4.9: on an Approvato case whose head is the approved revision (`revision.fork`), the
 * first save forks a working copy (`fork`, idempotent) and then saves to the copy's id and
 * version; a failed fork is retried like a failed save, a stale one reloads. Edits never fork
 * by themselves: only a save does.
 */
export function useDocument({ subject, revision, base, initial, save, onStale, fork, headVersion }: UseDocumentOptions): DocumentState {
  const [formats, setFormats] = useState<Formats>(initial);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [banner, setBanner] = useState(false);
  const [refused, setRefused] = useState<readonly string[] | null>(null);
  const [history, setHistory] = useState({ undo: 0, redo: 0 });

  const current = useRef<Formats>(initial);
  const saved = useRef<Formats>(initial);
  const version = useRef(revision?.version ?? 0);
  const revisionId = useRef(revision?.id);
  const head = useRef(headVersion);
  /** The `headVersion` prop last seen: a refresh that brings a new one replaces `head`. */
  const headProp = useRef(headVersion);
  const needsFork = useRef(revision?.fork === true);
  const [forkPending, setForkPending] = useState(revision?.fork === true);
  const past = useRef<Step[]>([]);
  const future = useRef<Step[]>([]);
  const group = useRef<string | undefined>(undefined);
  const inFlight = useRef(false);
  const failures = useRef(0);
  /** The last save was refused for its content: nothing retries until the next edit. */
  const blocked = useRef(false);
  const stopped = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The latest props, for the save loop running across renders.
  const latest = useRef({ subject, revision, base, save, onStale, fork });
  useEffect(() => {
    latest.current = { subject, revision, base, save, onStale, fork };
    if (headVersion !== headProp.current) {
      headProp.current = headVersion;
      head.current = headVersion;
    }
  });

  const clearTimers = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    if (retry.current !== null) clearTimeout(retry.current);
    timer.current = null;
    retry.current = null;
  };

  const run = useCallback(async function run(): Promise<void> {
    const { subject, revision, base, save, onStale, fork } = latest.current;
    if (stopped.current || revision === null || !revision.editable || inFlight.current) return;
    if (current.current === saved.current) {
      // Undone back to what the server holds: nothing to send.
      if (failures.current === 0) setSaveState("saved");
      return;
    }
    if (timer.current !== null) clearTimeout(timer.current);
    if (retry.current !== null) clearTimeout(retry.current);
    timer.current = null;
    retry.current = null;

    inFlight.current = true;
    setSaveState("saving");

    // Story 4.9: the approved revision is never written; the first save forks a working copy.
    if (needsFork.current) {
      let forked: ActionResult<ForkResult> | null;
      const expected = head.current;
      try {
        forked = fork === undefined || expected === undefined ? null : await fork({ ...subjectKey(subject), expectedHeadVersion: expected });
      } catch {
        forked = null;
      }
      inFlight.current = false;
      if (stopped.current) return;
      // A copy this call didn't create (another tab forked, maybe edited): saving to it would overwrite. Reload.
      if (forked?.ok === true && !createdByThisFork(forked.value, expected!)) {
        stopped.current = true;
        clearTimers();
        onStale();
        return;
      }
      if (forked?.ok === true) {
        revisionId.current = forked.value.revisionId;
        version.current = forked.value.version;
        head.current = forked.value.headVersion;
        needsFork.current = false;
        setForkPending(false);
        return run();
      }
      return failed(forked);
    }

    const sent = current.current;
    let result: ActionResult<{ version: number }> | null;
    try {
      result = await save({ ...subjectKey(subject), revisionId: revisionId.current ?? revision.id, doc: { ...base, formats: stored(sent) }, expectedVersion: version.current });
    } catch {
      result = null;
    }
    inFlight.current = false;
    if (stopped.current) return;

    if (result?.ok === true) {
      version.current = result.value.version;
      saved.current = sent;
      failures.current = 0;
      setBanner(false);
      setRefused(null);
      // Edits made while it was in flight: save them now.
      if (current.current !== sent) return run();
      setSaveState("saved");
      return;
    }
    return failed(result);

    /** A save or fork that didn't go through: reload when stale, else retry (or wait for the next edit). */
    function failed(result: { ok: false; error: { code: string; assetIds?: string[] } } | { ok: true } | null): void {
      if (result?.ok === true) return;
      if (result !== null && STALE_CODES.has(result.error.code)) {
        stopped.current = true;
        clearTimers();
        onStale();
        return;
      }
      failures.current += 1;
      setSaveState("retrying");
      // Only a refusal that names its files keeps them; any other failure shows the plain banner.
      const named = result?.ok === false && result.error.code === "ASSET_NOT_ALLOWED" ? (result.error.assetIds ?? []) : [];
      setRefused(named.length > 0 ? named : null);
      if (result !== null && PERMANENT_CODES.has(result.error.code)) {
        // The same document would be refused again: wait for the next edit.
        blocked.current = true;
        setBanner(true);
        return;
      }
      if (failures.current >= BANNER_AFTER) setBanner(true);
      const wait = RETRY_DELAYS_MS[Math.min(failures.current, RETRY_DELAYS_MS.length) - 1];
      retry.current = setTimeout(() => void run(), wait);
    }
  }, []);

  const schedule = useCallback(() => {
    // While failing, the retry timer paces the saves; a refused document waits for this edit.
    if (blocked.current) {
      blocked.current = false;
      failures.current = 0;
    }
    if (failures.current > 0) return;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => void run(), DEBOUNCE_MS);
  }, [run]);

  const show = useCallback(
    (next: Formats) => {
      current.current = next;
      setFormats(next);
      // An edit waiting for its save already reads *Salvataggio…* (not while failing: that state stays).
      if (failures.current === 0 && latest.current.revision?.editable === true) setSaveState("saving");
      setHistory({ undo: past.current.length, redo: future.current.length });
      schedule();
    },
    [schedule],
  );

  const change = useCallback(
    (next: Formats, formatId: FormatId, key?: string) => {
      if (next === current.current || stopped.current) return;
      if (key === undefined || key !== group.current) {
        past.current.push({ formats: current.current, formatId });
        if (past.current.length > HISTORY_LIMIT) past.current.shift();
        future.current = [];
      }
      group.current = key;
      show(next);
    },
    [show],
  );

  const step = useCallback(
    (from: { current: Step[] }, to: { current: Step[] }): FormatId | undefined => {
      if (stopped.current) return undefined;
      const target = from.current.pop();
      if (target === undefined) return undefined;
      to.current.push({ formats: current.current, formatId: target.formatId });
      group.current = undefined;
      show(target.formats);
      return target.formatId;
    },
    [show],
  );

  const undo = useCallback(() => step(past, future), [step]);
  const redo = useCallback(() => step(future, past), [step]);

  const flush = useCallback(() => {
    group.current = undefined;
    if (failures.current === 0) void run();
  }, [run]);

  const settle = useCallback(async () => {
    group.current = undefined;
    const deadline = Date.now() + SETTLE_TIMEOUT_MS;
    const drained = async () => {
      while (inFlight.current) {
        if (Date.now() > deadline) return false;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return true;
    };
    // A save in flight finishes first; then whatever was edited meanwhile goes now.
    if (!(await drained()) || stopped.current) return false;
    if (current.current !== saved.current) await run();
    if (!(await drained())) return false;
    // What's shown is what's stored (an earlier failure undone back to it counts as saved).
    return !stopped.current && current.current === saved.current;
  }, [run]);

  const currentVersion = useCallback(() => version.current, []);
  const currentRevisionId = useCallback(() => revisionId.current, []);
  const currentHeadVersion = useCallback(() => head.current, []);
  const stop = useCallback(() => {
    stopped.current = true;
    clearTimers();
  }, []);
  const approved = useCallback(() => {
    needsFork.current = true;
    setForkPending(true);
  }, []);

  useEffect(() => {
    // Closing or reloading the tab with an edit not yet saved asks first.
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!stopped.current && current.current !== saved.current) event.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      clearTimers();
      // Leaving in the app (no beforeunload) with an edit not yet sent: send it, best effort.
      const { subject, revision, base, save, fork } = latest.current;
      if (!stopped.current && !inFlight.current && current.current !== saved.current && revision?.editable === true) {
        const doc = { ...base, formats: stored(current.current) };
        const send = async () => {
          let target = { revisionId: revisionId.current ?? revision.id, version: version.current };
          // Story 4.9: still on the approved revision: fork first, then save to the copy.
          if (needsFork.current) {
            if (fork === undefined || head.current === undefined) return;
            const expected = head.current;
            const forked = await fork({ ...subjectKey(subject), expectedHeadVersion: expected });
            if (!forked.ok || !createdByThisFork(forked.value, expected)) return;
            target = { revisionId: forked.value.revisionId, version: forked.value.version };
          }
          await save({ ...subjectKey(subject), revisionId: target.revisionId, doc, expectedVersion: target.version });
        };
        void send().catch(() => undefined);
      }
      // A save still in flight must not retry or reload after unmount.
      stopped.current = true;
    };
  }, []);

  return {
    formats,
    save: saveState,
    banner,
    refused,
    canUndo: history.undo > 0,
    canRedo: history.redo > 0,
    change,
    flush,
    settle,
    version: currentVersion,
    revisionId: currentRevisionId,
    headVersion: currentHeadVersion,
    forkPending,
    approved,
    stop,
    undo,
    redo,
  };
}
