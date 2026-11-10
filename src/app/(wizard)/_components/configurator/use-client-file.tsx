"use client";

import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CURRENT_SCHEMA_VERSION } from "@/modules/generation";
import { FORMAT_IDS, type FormatId, type RenderAsset } from "@/modules/rendering";
import type { ActionResult } from "@/app/_lib/action-result";
import { fill, it } from "@/shared/i18n/it";
import { fileSegmentsByFormat, filePages, partsChanged, type ClientFile, type FilePartData, type FileSegment } from "./client-file";
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
  /** The whole page read again (a part couldn't be). */
  refresh: () => void;
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
  /** Whether part `key` has a working copy not yet published (an approved case or intro edited, Story 4.9). */
  copyPending: (key: string) => boolean;
  /** Part `key` read again alone; its unsaved edits go, the others' stay. */
  reload: (key: string) => Promise<void>;
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
export function useClientFile(file: ClientFile | undefined, { say, refresh, onAssets }: ClientFileOptions): ClientFileState | null {
  const [mounted, setMounted] = useState<Mounted[]>(() =>
    file === undefined ? [] : [...(file.intro === null ? [] : [file.intro]), ...file.cases].map((part) => ({ part, generation: 0 })),
  );
  const docs = useRef(new Map<string, { token: string; doc: DocumentState }>());
  const [, rerender] = useState(0);
  const register = useCallback((key: string, token: string, doc: DocumentState | null) => {
    const prev = docs.current.get(key);
    if (doc === null) {
      if (prev?.token === token) docs.current.delete(key);
      return;
    }
    docs.current.set(key, { token, doc });
    if (prev?.token !== token || !same(prev.doc, doc)) rerender((n) => n + 1);
  }, []);

  const introKey = file?.intro?.key;
  const introPart = mounted.find((m) => m.part.subject.kind === "client_intro")?.part ?? null;
  const cases = useMemo(() => mounted.filter((m) => m.part.subject.kind === "case").map((m) => m.part), [mounted]);
  const parts = useMemo(() => mounted.map((m) => m.part), [mounted]);
  const docOf = (key: string) => docs.current.get(key)?.doc;
  const formatsOf = (part: FilePartData): Formats => docOf(part.key)?.formats ?? part.formats;

  // The segments are worked out again only when a part's pages change.
  const inputs = parts.map((p) => formatsOf(p));
  const cache = useRef<{ inputs: readonly Formats[]; parts: readonly FilePartData[]; segments: Record<FormatId, FileSegment[]>; formats: Formats } | null>(null);
  if (
    cache.current === null ||
    cache.current.parts !== parts ||
    cache.current.inputs.length !== inputs.length ||
    cache.current.inputs.some((f, i) => f !== inputs[i])
  ) {
    const formatsByKey = new Map(parts.map((p, i) => [p.key, inputs[i]!]));
    const segments = fileSegmentsByFormat(introPart, cases, (p) => formatsByKey.get(p.key) ?? p.formats);
    const formats = Object.fromEntries(FORMAT_IDS.map((id) => [id, filePages(segments[id])])) as unknown as Formats;
    cache.current = { inputs, parts, segments, formats };
  }
  const { segments, formats } = cache.current;

  /** The latest state, for callbacks that outlive a render. */
  const latest = useRef({ parts, segments, formats, formatsOf });
  latest.current = { parts, segments, formats, formatsOf };

  // One undo history across the file: each step, the parts it changed.
  const past = useRef<string[][]>([]);
  const future = useRef<string[][]>([]);
  const group = useRef<{ key: string | undefined; mapped: string | undefined }>({ key: undefined, mapped: undefined });
  const groupCount = useRef(0);
  const [history, setHistory] = useState({ undo: 0, redo: 0 });
  const syncHistory = () => setHistory({ undo: past.current.length, redo: future.current.length });

  const change = useCallback((next: Formats, _formatId: FormatId, key?: string): boolean => {
    const now = latest.current;
    const changed = partsChanged(next, now.formats, now.segments, now.parts, now.formatsOf);
    if (changed === null) return false;
    const keys = [...changed.keys()].filter((k) => {
      const part = now.parts.find((p) => p.key === k);
      return part !== undefined && part.revision.editable;
    });
    if (keys.length === 0) return true;
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
      const doc = docOf(k);
      const formatsNow = changed.get(k)!;
      // The format the part's own step names: the first one it changed.
      const formatId = FORMAT_IDS.find((id) => formatsNow[id] !== (doc?.formats ?? now.parts.find((p) => p.key === k)!.formats)[id]) ?? _formatId;
      doc?.change(formatsNow, formatId, group.current.mapped);
    }
    syncHistory();
    return true;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- reads only refs

  const step = useCallback((from: { current: string[][] }, to: { current: string[][] }, undo: boolean): FormatId | undefined => {
    group.current = { key: undefined, mapped: undefined };
    const target = from.current.pop();
    if (target === undefined) return undefined;
    let formatId: FormatId | undefined;
    for (const k of target) {
      const doc = docOf(k);
      const changed = undo ? doc?.undo() : doc?.redo();
      formatId ??= changed;
    }
    to.current.push(target);
    syncHistory();
    return formatId;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- reads only refs

  const undo = useCallback(() => step(past, future, true), [step]);
  const redo = useCallback(() => step(future, past, false), [step]);

  const flush = useCallback(() => {
    group.current = { key: undefined, mapped: undefined };
    for (const { doc } of docs.current.values()) doc.flush();
  }, []);

  const settle = useCallback(async () => {
    group.current = { key: undefined, mapped: undefined };
    const all = await Promise.all([...docs.current.values()].map(({ doc }) => doc.settle()));
    return all.every(Boolean);
  }, []);

  /** Part `key` read again alone: a fresh document for it; its steps leave the history. */
  const reload = useCallback(
    async (key: string) => {
      const part = latest.current.parts.find((p) => p.key === key);
      if (file === undefined || part === undefined) return;
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
        say(fill(t.partReloaded, { part: fresh.subject.kind === "case" ? fill(t.casePart, { code: fresh.code }) : t.introPart }));
        return;
      }
      if ((result?.ok === true && result.value === null) || (result?.ok === false && result.error.code === "NOT_FOUND")) {
        // The case left the file, or the intro isn't ready any more: its group shows without it.
        drop();
        setMounted((current) => current.filter((m) => m.part.key !== key));
        if (part.subject.kind === "case") say(fill(t.caseGone, { code: part.code }));
        else say(fill(t.partReloaded, { part: t.introPart }));
        return;
      }
      say(t.reloadFailed);
      refresh();
    },
    [file, onAssets, refresh, say],
  );

  const all = [...docs.current.values()].map(({ doc }) => doc);
  const intro = introPart === null ? null : (docOf(introPart.key) ?? null);
  const refused = all.flatMap((d) => d.refused ?? []);

  const copyPending = useCallback((key: string) => {
    const part = latest.current.parts.find((p) => p.key === key);
    if (part === undefined || !part.revision.editable || part.status !== "approved") return false;
    const doc = docOf(key);
    return doc === undefined ? part.revision.fork !== true : !doc.forkPending;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- reads only refs

  const partOf = useCallback(
    (pageKey: string) => {
      const now = latest.current;
      for (const id of FORMAT_IDS) {
        const segment = now.segments[id].find((s) => s.pages.some((p) => p.pageKey === pageKey));
        if (segment !== undefined) return now.parts.find((p) => p.key === segment.partKey);
      }
      return undefined;
    },
    [],
  );

  const noop = useCallback(() => {}, []);
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
      save={part.key === introKey || part.subject.kind === "client_intro" ? file.onSaveIntro : file.onSaveCase}
      {...(part.subject.kind === "client_intro" ? (file.onForkIntro === undefined ? {} : { fork: file.onForkIntro }) : { fork: file.onForkCase })}
      onStale={(key) => void reload(key)}
      register={register}
    />
  ));
  return { doc, intro, introPart, cases, segments, partOf, copyPending, reload, element };
}
