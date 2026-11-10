"use client";

import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CURRENT_SCHEMA_VERSION } from "@/modules/generation";
import { FORMAT_IDS, type FormatId, type RenderAsset } from "@/modules/rendering";
import type { ActionResult } from "@/app/_lib/action-result";
import { fill, it } from "@/shared/i18n/it";
import { fileSegmentsByFormat, filePages, mergeCaseOrder, moveKey, partsChanged, withCaseOrder, type ClientFile, type FilePartData, type FileSegment } from "./client-file";
import type { SaveState } from "./top-bar";
import { HISTORY_LIMIT, useDocument, type DocumentState, type ForkInput, type ForkResult, type Formats, type SaveInput } from "./use-document";

/** A part as mounted: its data, and a generation that a reload bumps (a fresh document). */
interface Mounted {
  part: FilePartData;
  generation: number;
}

/** What the file's document needs from the configurator. */
export interface ClientFileOptions {
  /** A message at the top of the canvas. */
  say: (text: string) => void;
  /** The whole page loaded afresh (a part couldn't be read again: its document stopped). */
  reloadPage: () => void;
  /** A reloaded part's render assets, to draw it. */
  onAssets: (assets: Readonly<Record<string, RenderAsset>>) => void;
}

/** The client's file as the configurator edits it (Story 4.12a). */
export interface ClientFileState {
  /** Every part's pages as one document: what the canvas, Pagine and every tool edit. */
  doc: DocumentState;
  /** The intro's own document (Approva, Aggiorna and Scarta act on it alone); null without an intro. */
  intro: DocumentState | null;
  /** The intro as mounted (its status and `headVersion`, after a reload too); null without one. */
  introPart: FilePartData | null;
  cases: readonly FilePartData[];
  /** Each format's segments, as shown. */
  segments: Readonly<Record<FormatId, readonly FileSegment[]>>;
  /** The part a file page key belongs to. */
  partOf: (pageKey: string) => FilePartData | undefined;
  /** The files part `key`'s last save was refused for (`ASSET_NOT_ALLOWED`); null when none. */
  refusedOf: (key: string) => readonly string[] | null;
  /** Part `key`'s whole pages now (those the file doesn't show included): what its own limits count. */
  partFormats: (key: string) => Formats | undefined;
  /** Whether part `key` has a working copy not yet published (an approved case or intro edited, Story 4.9). */
  copyPending: (key: string) => boolean;
  /** Part `key` read again alone; its unsaved edits go, the others' stay. `quiet`: no message (the caller said why). */
  reload: (key: string, quiet?: boolean) => Promise<void>;
  /**
   * Story 4.12b: case `key` moved to position `to` (from 0) in every format at once, announced,
   * and the order saved for the client at once (cases not in the file kept in their saved places);
   * a failed save puts the last saved order back, calls `onRollback` and says so; a case or the
   * client gone meanwhile loads the page afresh. Not an edit: no undo step. Undefined when the
   * cases can't be reordered.
   */
  moveCase?: (key: string, to: number, onRollback?: () => void) => void;
  /** The parts' own documents, to mount (each runs its own autosave). */
  element: ReactNode;
}


/** The autosave's state across the parts: any retrying, else any saving, else saved. */
const aggregateSave = (states: readonly SaveState[]): SaveState =>
  states.includes("retrying") ? "retrying" : states.includes("saving") ? "saving" : "saved";

/** One part's own document, mounted out of sight: it registers itself with the file on every render. */
const PartDocument = memo(function PartDocument({
  part,
  token,
  save,
  fork,
  onStale,
  register,
}: {
  part: FilePartData;
  token: string;
  save: (input: SaveInput) => Promise<ActionResult<{ version: number }>>;
  fork?: (input: ForkInput) => Promise<ActionResult<ForkResult>>;
  onStale: (key: string) => void;
  register: (key: string, token: string, doc: DocumentState | null) => void;
}) {
  const doc = useDocument({
    subject: part.subject,
    revision: part.revision,
    base: { schemaVersion: CURRENT_SCHEMA_VERSION, kind: part.revision.kind, template: part.template },
    initial: part.formats,
    save,
    onStale: () => onStale(part.key),
    ...(fork === undefined ? {} : { fork }),
    headVersion: part.headVersion,
  });
  useLayoutEffect(() => {
    register(part.key, token, doc);
  });
  useLayoutEffect(() => () => register(part.key, token, null), [part.key, token, register]);
  return null;
});

/** The fields of a part's document the file shows: a change re-renders the file. */
const same = (a: DocumentState | undefined, b: DocumentState) =>
  a !== undefined &&
  a.formats === b.formats &&
  a.save === b.save &&
  a.banner === b.banner &&
  a.refused === b.refused &&
  a.forkPending === b.forkPending;

/**
 * The client's whole file as one document (Story 4.12a): each part (the intro, each approved
 * case) keeps its own `useDocument`, so it saves to its own revision with its own version and
 * fork (AD-17, Story 4.9), and the file shows their pages in segments (`composeParts`), each
 * page key prefixed by its segment. An edit of the file is cut back into the parts it touched
 * (a page can't change part: such an edit is refused). One undo history runs across the file:
 * each step names the parts it changed, and ⌘Z undoes it in each. A part whose save is stale
 * is read again alone (`file.onReload`): the others keep their state and unsaved edits.
 */
export function useClientFile(file: ClientFile | undefined, { say, reloadPage, onAssets }: ClientFileOptions): ClientFileState | null {
  const [mounted, setMounted] = useState<Mounted[]>(() =>
    file === undefined ? [] : [...(file.intro === null ? [] : [file.intro]), ...file.cases].map((part) => ({ part, generation: 0 })),
  );
  /** Each part's own document as last registered (its watched fields changed). */
  const [entries, setEntries] = useState<ReadonlyMap<string, { token: string; doc: DocumentState }>>(() => new Map());
  /** Each part's pages as last registered: changes only with a part's pages, so the segments do too. */
  const [pagesByKey, setPagesByKey] = useState<ReadonlyMap<string, { token: string; formats: Formats }>>(() => new Map());
  const register = useCallback((key: string, token: string, doc: DocumentState | null) => {
    setEntries((prev) => {
      const was = prev.get(key);
      if (doc === null) {
        if (was?.token !== token) return prev;
        const next = new Map(prev);
        next.delete(key);
        return next;
      }
      if (was?.token === token && same(was.doc, doc)) return prev;
      return new Map(prev).set(key, { token, doc });
    });
    setPagesByKey((prev) => {
      const was = prev.get(key);
      if (doc === null) {
        if (was?.token !== token) return prev;
        const next = new Map(prev);
        next.delete(key);
        return next;
      }
      if (was?.token === token && was.formats === doc.formats) return prev;
      return new Map(prev).set(key, { token, formats: doc.formats });
    });
  }, []);

  const introPart = useMemo(() => mounted.find((m) => m.part.subject.kind === "client_intro")?.part ?? null, [mounted]);
  const cases = useMemo(() => mounted.filter((m) => m.part.subject.kind === "case").map((m) => m.part), [mounted]);
  const parts = useMemo(() => mounted.map((m) => m.part), [mounted]);
  /** A mounted part's pages: its document's, else (not registered yet) as read. */
  const formatsOf = useCallback(
    (part: FilePartData): Formats => {
      const mine = pagesByKey.get(part.key);
      const generation = mounted.find((m) => m.part.key === part.key)?.generation ?? 0;
      return mine !== undefined && mine.token === `${part.key}:${generation}` ? mine.formats : part.formats;
    },
    [mounted, pagesByKey],
  );
  const { segments, formats } = useMemo(() => {
    const segments = fileSegmentsByFormat(introPart, cases, formatsOf);
    const formats = Object.fromEntries(FORMAT_IDS.map((id) => [id, filePages(segments[id])])) as unknown as Formats;
    return { segments, formats };
  }, [cases, formatsOf, introPart]);
  const docOf = (key: string) => {
    const generation = mounted.find((m) => m.part.key === key)?.generation ?? 0;
    const entry = entries.get(key);
    return entry !== undefined && entry.token === `${key}:${generation}` ? entry.doc : undefined;
  };

  /** The latest state, for callbacks that outlive a render. */
  const latest = useRef({ parts, segments, formats, formatsOf, docOf });
  useLayoutEffect(() => {
    latest.current = { parts, segments, formats, formatsOf, docOf };
  });

  // One undo history across the file: each step, the parts it changed.
  const past = useRef<string[][]>([]);
  const future = useRef<string[][]>([]);
  const group = useRef<{ key: string | undefined; mapped: string | undefined }>({ key: undefined, mapped: undefined });
  const groupCount = useRef(0);
  const [history, setHistory] = useState({ undo: 0, redo: 0 });
  const syncHistory = () => setHistory({ undo: past.current.length, redo: future.current.length });

  const change = useCallback((next: Formats, _formatId: FormatId, key?: string): boolean => {
    const now = latest.current;
    const t = it.configurator.file;
    const changed = partsChanged(next, now.formats, now.segments, now.parts, now.formatsOf);
    if (changed === "moved" || changed === "empty") {
      say(changed === "moved" ? t.otherPart : t.nothingHere);
      return false;
    }
    const keys = [...changed.keys()];
    if (keys.length === 0) return true;
    // A part that can't be edited here (read-only, or its document not running) refuses the whole edit.
    if (keys.some((k) => now.parts.find((p) => p.key === k)?.revision.editable !== true || now.docOf(k) === undefined)) {
      say(t.locked);
      return false;
    }
    const newStep = key === undefined || key !== group.current.key;
    if (newStep) {
      groupCount.current += 1;
      group.current = { key, mapped: key === undefined ? undefined : `${key}#${groupCount.current}` };
      past.current.push(keys);
      if (past.current.length > HISTORY_LIMIT) past.current.shift();
      future.current = [];
    } else {
      // The same typing session, in a part the step didn't touch yet: it joins the step.
      const top = past.current.at(-1);
      if (top !== undefined) for (const k of keys) if (!top.includes(k)) top.push(k);
    }
    for (const k of keys) {
      const doc = now.docOf(k);
      const formatsNow = changed.get(k)!;
      // The format the part's own step names: the first one it changed.
      const formatId = FORMAT_IDS.find((id) => formatsNow[id] !== (doc?.formats ?? now.parts.find((p) => p.key === k)!.formats)[id]) ?? _formatId;
      doc?.change(formatsNow, formatId, group.current.mapped);
    }
    syncHistory();
    return true;
  }, [say]);

  const step = useCallback((from: { current: string[][] }, to: { current: string[][] }, undo: boolean): FormatId | undefined => {
    group.current = { key: undefined, mapped: undefined };
    const target = from.current.pop();
    if (target === undefined) return undefined;
    let formatId: FormatId | undefined;
    for (const k of target) {
      const doc = latest.current.docOf(k);
      const changed = undo ? doc?.undo() : doc?.redo();
      formatId ??= changed;
    }
    to.current.push(target);
    syncHistory();
    return formatId;
  }, []);

  const undo = useCallback(() => step(past, future, true), [step]);
  const redo = useCallback(() => step(future, past, false), [step]);

  const flush = useCallback(() => {
    group.current = { key: undefined, mapped: undefined };
    for (const part of latest.current.parts) latest.current.docOf(part.key)?.flush();
  }, []);

  const settle = useCallback(async () => {
    group.current = { key: undefined, mapped: undefined };
    const now = latest.current;
    const all = await Promise.all(now.parts.map((part) => now.docOf(part.key)?.settle() ?? Promise.resolve(true)));
    return all.every(Boolean);
  }, []);

  /** Story 4.12b: the file's case keys in the order the server last confirmed (as loaded, each saved one, minus cases dropped). */
  const confirmedOrder = useRef<readonly string[]>(cases.map((c) => c.key));
  /** The server's saved order (case ids), cases not in the file included: what a save keeps them in. */
  const savedIds = useRef<readonly string[]>(file?.caseOrder ?? []);
  /** The order saves, one after the other, so the last one sent is the one kept. */
  const orderSaves = useRef<Promise<void>>(Promise.resolve());
  /** The latest move: only its failure puts the confirmed order back (a later save carries the whole order). */
  const lastMove = useRef(0);

  /** The parts being read again: one reload per part at a time, later calls ignored meanwhile. */
  const reloading = useRef(new Set<string>());

  /** Part `key` read again alone: a fresh document for it; its steps leave the history. */
  const reload = async (key: string, quiet = false) => {
    const part = latest.current.parts.find((p) => p.key === key);
    if (file === undefined || part === undefined || reloading.current.has(key)) return;
    reloading.current.add(key);
    try {
      await reloadPart(part, quiet);
    } finally {
      reloading.current.delete(key);
    }
  };

  async function reloadPart(part: FilePartData, quiet: boolean) {
    {
      const key = part.key;
      if (file === undefined) return;
      const drop = () => {
        past.current = past.current.map((s) => s.filter((k) => k !== key)).filter((s) => s.length > 0);
        future.current = future.current.map((s) => s.filter((k) => k !== key)).filter((s) => s.length > 0);
        syncHistory();
      };
      let result: ActionResult<FilePartData | null> | null;
      try {
        result =
          part.subject.kind === "case"
            ? await file.onReload({ clientId: file.clientId, part: "case", caseId: part.subject.id })
            : await file.onReload({ clientId: file.clientId, part: "client_intro" });
      } catch {
        result = null;
      }
      const t = it.configurator.file;
      if (result?.ok === true && result.value !== null) {
        const fresh = result.value;
        onAssets(fresh.assets);
        drop();
        setMounted((current) => current.map((m) => (m.part.key === key ? { part: fresh, generation: m.generation + 1 } : m)));
        if (!quiet) say(fill(t.partReloaded, { part: fresh.subject.kind === "case" ? fill(t.casePart, { code: fresh.code }) : t.introPart }));
        return;
      }
      if ((result?.ok === true && result.value === null) || (result?.ok === false && result.error.code === "NOT_FOUND")) {
        // The case left the file, or the intro isn't ready any more: its group shows without it.
        drop();
        setMounted((current) => current.filter((m) => m.part.key !== key));
        confirmedOrder.current = confirmedOrder.current.filter((k) => k !== key);
        if (part.subject.kind === "case") say(fill(t.caseGone, { code: part.code }));
        else if (!quiet) say(fill(t.partReloaded, { part: t.introPart }));
        return;
      }
      // The part's document stopped on its stale save: only a full reload brings it back.
      say(t.reloadFailed);
      reloadPage();
    }
  }

  const all = parts.flatMap((part) => docOf(part.key) ?? []);
  const intro = introPart === null ? null : (docOf(introPart.key) ?? null);
  const refused = all.flatMap((d) => d.refused ?? []);

  const copyPending = (key: string) => {
    const part = parts.find((p) => p.key === key);
    if (part === undefined || !part.revision.editable || part.status !== "approved") return false;
    const doc = docOf(key);
    return doc === undefined ? part.revision.fork !== true : !doc.forkPending;
  };

  const partOf = (pageKey: string) => {
    for (const id of FORMAT_IDS) {
      const segment = segments[id].find((s) => s.pages.some((p) => p.pageKey === pageKey));
      if (segment !== undefined) return parts.find((p) => p.key === segment.partKey);
    }
    return undefined;
  };

  const onReorderCases = file?.onReorderCases;
  const clientId = file?.clientId;
  const moveCase = useCallback(
    (key: string, to: number, onRollback?: () => void) => {
      if (onReorderCases === undefined || clientId === undefined) return;
      const now = latest.current.parts.filter((p) => p.subject.kind === "case");
      const keys = now.map((p) => p.key);
      const next = moveKey(keys, key, to);
      if (next === keys) return;
      const t = it.configurator.file;
      setMounted((current) => withCaseOrder(current, next));
      const moved = now.find((p) => p.key === key)!;
      say(fill(t.projectMoved, { code: moved.code, n: next.indexOf(key) + 1, total: next.length }));
      const shown = next.map((k) => now.find((p) => p.key === k)!.subject.id);
      const move = ++lastMove.current;
      orderSaves.current = orderSaves.current.then(async () => {
        // Built when it's sent: after the saves before it, with what they kept.
        const caseIds = mergeCaseOrder(savedIds.current, shown);
        let saved: ActionResult<{ caseIds: string[] }> | null;
        try {
          saved = await onReorderCases({ clientId, caseIds });
        } catch {
          saved = null;
        }
        if (saved?.ok === true) {
          confirmedOrder.current = next;
          savedIds.current = saved.value.caseIds;
          return;
        }
        if (saved?.ok === false && (saved.error.code === "INVALID_INPUT" || saved.error.code === "CLIENT_NOT_FOUND")) {
          // A case (or the client) is gone meanwhile: retrying can't help, the page loads afresh.
          say(t.orderStale);
          reloadPage();
          return;
        }
        if (move !== lastMove.current) return;
        const shownNow = latest.current.parts.map((part) => ({ part }));
        if (withCaseOrder(shownNow, confirmedOrder.current) !== shownNow) onRollback?.();
        setMounted((current) => withCaseOrder(current, confirmedOrder.current));
        say(t.reorderFailed);
      });
    },
    [clientId, onReorderCases, reloadPage, say],
  );

  const noop = useCallback(() => {}, []);
  /** The latest `reload`, for the parts' stale saves (a stable callback keeps them from re-rendering). */
  const reloadNow = useRef(reload);
  useLayoutEffect(() => {
    reloadNow.current = reload;
  });
  const onStale = useCallback((key: string) => void reloadNow.current(key), []);
  const doc: DocumentState = {
    formats,
    save: aggregateSave(all.map((d) => d.save)),
    banner: all.some((d) => d.banner),
    refused: refused.length === 0 ? null : refused,
    canUndo: history.undo > 0,
    canRedo: history.redo > 0,
    change,
    flush,
    settle,
    version: intro?.version ?? (() => 0),
    revisionId: intro?.revisionId ?? (() => undefined),
    headVersion: intro?.headVersion ?? (() => undefined),
    forkPending: intro?.forkPending ?? false,
    approved: intro?.approved ?? noop,
    stop: intro?.stop ?? noop,
    undo,
    redo,
  };

  if (file === undefined) return null;
  const element = mounted.map(({ part, generation }) => (
    <PartDocument
      key={`${part.key}:${generation}`}
      part={part}
      token={`${part.key}:${generation}`}
      save={part.subject.kind === "client_intro" ? file.onSaveIntro : file.onSaveCase}
      {...(part.subject.kind === "client_intro" ? (file.onForkIntro === undefined ? {} : { fork: file.onForkIntro }) : { fork: file.onForkCase })}
      onStale={onStale}
      register={register}
    />
  ));
  const partFormats = (key: string) => {
    const part = parts.find((p) => p.key === key);
    return part === undefined ? undefined : formatsOf(part);
  };
  const refusedOf = (key: string) => docOf(key)?.refused ?? null;
  return {
    doc,
    intro,
    introPart,
    cases,
    segments,
    partOf,
    partFormats,
    refusedOf,
    copyPending,
    reload,
    ...(onReorderCases === undefined ? {} : { moveCase }),
    element,
  };
}
