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
  /** A `working` head of an In revisione case; otherwise nothing is edited or saved. */
  editable: boolean;
}

/** What a save sends: the whole document (each format as `{ pages }`, as stored), and the version it was based on. */
export interface SaveInput {
  caseId: string;
  revisionId: string;
  doc: { schemaVersion: number; kind: string; template: string; formats: Readonly<Record<FormatId, { pages: readonly Page[] }>> };
  expectedVersion: number;
}

/** The document shape of `formats`: each format's pages under `pages`. */
const stored = (formats: Formats): SaveInput["doc"]["formats"] =>
  Object.fromEntries(Object.entries(formats).map(([id, pages]) => [id, { pages }])) as SaveInput["doc"]["formats"];

export interface UseDocumentOptions {
  caseId: string;
  revision: EditedRevision | null;
  /** The document's fields other than its pages, sent back unchanged. */
  base: { schemaVersion: number; kind: string; template: string };
  initial: Formats;
  save: (input: SaveInput) => Promise<ActionResult<{ version: number }>>;
  /** Someone else saved first, or the case can no longer be edited: read it again (no retry). */
  onStale: () => void;
}

export interface DocumentState {
  formats: Formats;
  save: SaveState;
  /** Three saves in a row failed: *Le modifiche non si salvano.* */
  banner: boolean;
  canUndo: boolean;
  canRedo: boolean;
  /**
   * Records an edit made in `formatId` and saves it after {@link DEBOUNCE_MS}. Changes
   * with the same `group` (one text editing session) make one undo step.
   */
  change: (next: Formats, formatId: FormatId, group?: string) => void;
  /** Saves the latest document now (e.g. when a text editing session ends). */
  flush: () => void;
  /** Undoes or redoes one step and returns the format it changed, or undefined with nothing to do. */
  undo: () => FormatId | undefined;
  redo: () => FormatId | undefined;
}

/** The most undo steps kept. */
export const HISTORY_LIMIT = 100;

/** Waits before the 1st, 2nd and 3rd retry; later retries wait the last value here. */
export const RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 15_000] as const;

/** After this many failures in a row the banner shows. */
export const BANNER_AFTER = 3;

/** Refusals a retry can't fix because the server holds something newer: read it again instead. */
const STALE_CODES = new Set(["STALE_REVISION", "STALE_HEAD", "REVISION_NOT_WRITABLE", "CASE_NOT_EDITABLE", "NOT_FOUND"]);

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
 */
export function useDocument({ caseId, revision, base, initial, save, onStale }: UseDocumentOptions): DocumentState {
  const [formats, setFormats] = useState<Formats>(initial);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [banner, setBanner] = useState(false);
  const [history, setHistory] = useState({ undo: 0, redo: 0 });

  const current = useRef<Formats>(initial);
  const saved = useRef<Formats>(initial);
  const version = useRef(revision?.version ?? 0);
  const past = useRef<Step[]>([]);
  const future = useRef<Step[]>([]);
  const group = useRef<string | undefined>(undefined);
  const inFlight = useRef(false);
  const failures = useRef(0);
  const stopped = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The latest props, for the save loop running across renders.
  const latest = useRef({ caseId, revision, base, save, onStale });
  useEffect(() => {
    latest.current = { caseId, revision, base, save, onStale };
  });

  const clearTimers = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    if (retry.current !== null) clearTimeout(retry.current);
    timer.current = null;
    retry.current = null;
  };

  const run = useCallback(async function run(): Promise<void> {
    const { caseId, revision, base, save, onStale } = latest.current;
    if (stopped.current || revision === null || !revision.editable || inFlight.current) return;
    if (current.current === saved.current) return;
    if (timer.current !== null) clearTimeout(timer.current);
    if (retry.current !== null) clearTimeout(retry.current);
    timer.current = null;
    retry.current = null;

    inFlight.current = true;
    setSaveState("saving");
    const sent = current.current;
    let result: ActionResult<{ version: number }> | null;
    try {
      result = await save({ caseId, revisionId: revision.id, doc: { ...base, formats: stored(sent) }, expectedVersion: version.current });
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
      // Edits made while it was in flight: save them now.
      if (current.current !== sent) return run();
      setSaveState("saved");
      return;
    }
    if (result !== null && STALE_CODES.has(result.error.code)) {
      stopped.current = true;
      clearTimers();
      onStale();
      return;
    }
    failures.current += 1;
    setSaveState("retrying");
    if (failures.current >= BANNER_AFTER) setBanner(true);
    const wait = RETRY_DELAYS_MS[Math.min(failures.current, RETRY_DELAYS_MS.length) - 1];
    retry.current = setTimeout(() => void run(), wait);
  }, []);

  const schedule = useCallback(() => {
    // While failing, the retry timer paces the saves.
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
      const target = from.current.pop();
      if (target === undefined || stopped.current) return undefined;
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

  useEffect(() => {
    // Closing or reloading the tab with an edit not yet saved asks first.
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!stopped.current && current.current !== saved.current) event.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      clearTimers();
    };
  }, []);

  return { formats, save: saveState, banner, canUndo: history.undo > 0, canRedo: history.redo > 0, change, flush, undo, redo };
}
