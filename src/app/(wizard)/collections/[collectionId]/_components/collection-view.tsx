"use client";

import { ArrowLeft, Eye, Pencil, Tag } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from "react";
import { DANGER_ACTION, PRIMARY_ACTION, SECONDARY_ACTION } from "@/app/_components/button-styles";
import { Dialog } from "@/app/_components/dialog";
import type { ActionResult } from "@/app/_lib/action-result";
import { collectionsHref } from "@/app/_lib/routes";
import { TagsFields, invalidFields, refusedFields, type CollectionField, type TagOptions, type TagsValue } from "@/app/(tool)/collections/_components/collection-fields";
import { MAX_TEXT_CHARS, type Page } from "@/modules/generation";
import type { FormatId, RenderAsset } from "@/modules/rendering";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { Canvas, type CanvasGroup } from "@/app/(wizard)/_components/configurator/canvas";
import { typedText } from "@/app/(wizard)/_components/configurator/in-place-text";
import { findElement } from "@/app/(wizard)/_components/configurator/selection";
import type { InstagramView } from "@/app/(wizard)/_components/configurator/instagram-overlay";
import { StatusMessage, useStatusMessage } from "@/app/(wizard)/_components/configurator/status-message";
import { EYEBROW, ICON_BUTTON } from "@/app/(wizard)/_components/configurator/styles";
import { FormatSwitch } from "@/app/(wizard)/_components/configurator/top-bar";
import { AddCasesDialog } from "./add-cases-dialog";
import {
  collectionSegments,
  EMPTY_VALUES,
  freeTextIn,
  groupOfCase,
  movedPageOrder,
  normaliseTyped,
  orderedPages,
  originalText,
  pageTextEdits,
  partOfKey,
  partPagesOf,
  shownPagesOfPart,
  withCaseMoved,
  withGroupMoved,
  withPageHidden,
  withPageOrder,
  withTextEdit,
  type CollectionCandidate,
  type CollectionGroup,
  type SegmentEntry,
  type ViewEdits,
  type ViewSegment,
} from "./collection-file";
import { HiddenPageStrip, TextMarks } from "./collection-marks";
import { CollectionExportButton } from "./collection-export-button";
import { CollectionPagine } from "./collection-pagine";

/** What every items change returns: the collection's new version and its cases in order. */
type Write = ActionResult<{ collectionId: string; version: number; caseIds: string[] }>;

/** What every edit returns (Story 5.11a): the collection's new version. */
type EditWrite = ActionResult<{ collectionId: string; version: number }>;
/** A page of a part, as the edit actions name it. */
interface PageInput {
  collectionId: string;
  expectedVersion: number;
  part: { kind: "case" | "client_intro"; id: string };
  formatId: string;
  pageKey: string;
}

/** The collection page's server actions (Stories 5.10a, 5.11a), each a compare-and-set on `expectedVersion`. */
export interface CollectionActions {
  moveGroup: (input: { collectionId: string; expectedVersion: number; clientId: string; to: number }) => Promise<Write>;
  moveItem: (input: { collectionId: string; expectedVersion: number; caseId: string; to: number }) => Promise<Write>;
  addItems: (input: { collectionId: string; expectedVersion: number; caseIds: string[] }) => Promise<Write>;
  removeItems: (input: { collectionId: string; expectedVersion: number; caseIds: string[] }) => Promise<Write>;
  retag: (input: { collectionId: string; expectedVersion: number } & TagsValue) => Promise<ActionResult<{ version: number; tags: { businessLines: string[]; industries: string[] } }>>;
  setText: (input: PageInput & { elementId: string; text: string }) => Promise<EditWrite>;
  restoreText: (input: PageInput & { elementId: string }) => Promise<EditWrite>;
  setPageHidden: (input: PageInput & { hidden: boolean }) => Promise<EditWrite>;
  setPageOrder: (input: Omit<PageInput, "pageKey"> & { pageKeys: string[] }) => Promise<EditWrite>;
}

export interface CollectionViewProps {
  id: string;
  name: string;
  version: number;
  tags: TagsValue;
  groups: readonly CollectionGroup[];
  /** Story 5.11a: the collection's own edits, laid over the live pages. */
  edits: ViewEdits;
  assets: Readonly<Record<string, RenderAsset>>;
  candidates: readonly CollectionCandidate[];
  tagOptions: TagOptions;
  actions: CollectionActions;
  /**
   * Story 5.10b, what **Esporta** would put in the file: the cases with an approved revision
   * (none: no Esporta) and the "Non disponibile" ones it leaves out (the dialog says how many).
   */
  exportCounts: { available: number; unavailable: number };
}

const noop = () => {};
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/** The canvas groups of a format's segments: each with its heading, an unavailable case with its note; `strip` draws a hidden page where it sat (none in Anteprima). */
function canvasGroupsOf(
  segments: readonly ViewSegment[],
  groups: readonly CollectionGroup[],
  strip: ((segment: ViewSegment, entry: SegmentEntry) => ReactNode) | null,
): CanvasGroup[] {
  const copy = it.collection;
  return segments.map((s) => {
    const group = groups.find((g) => g.clientId === s.clientId);
    const c = s.caseId === undefined ? undefined : group?.cases.find((x) => x.caseId === s.caseId);
    const label =
      s.kind === "intro"
        ? fill(copy.canvas.intro, { client: group?.clientName ?? "" })
        : s.kind === "closing"
          ? fill(copy.canvas.closing, { client: group?.clientName ?? "" })
          : fill(copy.canvas.case, { code: c?.code ?? "", name: c?.name ?? "" });
    const before = new Map<string, ReactNode>();
    let pending: ReactNode[] = [];
    if (strip !== null) {
      for (const entry of s.entries) {
        if (entry.hidden) pending.push(strip(s, entry));
        else if (pending.length > 0) {
          before.set(entry.page.pageKey, pending);
          pending = [];
        }
      }
    }
    return {
      key: s.key,
      label,
      template: s.template,
      values: s.values,
      pages: s.pages,
      ...(s.kind === "unavailable" ? { empty: `${copy.pages.unavailable}. ${copy.pages.unavailableNote}` } : {}),
      ...(before.size > 0 ? { before } : {}),
      ...(pending.length > 0 ? { after: pending } : {}),
    };
  });
}

/** The block of `page` holding element `elementId`, for the selection frame around a text being typed in. */
function blockOf(page: Page, elementId: string): string | undefined {
  return page.blocks.find((b) => findElement(b.elements, elementId) !== undefined)?.blockId;
}

/** Story 5.11a: an edit's refusals that mean the page's copy of the pages is out of date. */
const PAGE_DATA_REFUSALS = new Set(["INVALID_INPUT", "TEXT_NOT_EDITABLE", "COLLECTION_LAST_PAGE"]);

/** Whether a write was refused because the collection changed elsewhere (or went). */
const isStale = (code: string | null) => code === "STALE_COLLECTION" || code === "COLLECTION_NOT_FOUND";

/**
 * One collection (Story 5.10a) in the configurator's file view: the top bar (back to Raccolte, the name, the format switch,
 * Anteprima, the tags with **Modifica tag**), the canvas with each client's group as
 * `composeParts` lays it out by default, and **Pagine** to arrange it. Pages are the cases' live
 * approved revisions, drawn as they are now.
 *
 * Every move is shown at once and saved at once with the collection's version (compare-and-set),
 * one after the other; a failed save puts the previous order back and says "Ordine non salvato.
 * Riprova." Adding and removing cases save, then read the page again (a client's intro may appear
 * or go). Removing the last case is refused. **Esporta** (Story 5.10b) opens the export dialog of a
 * case and a client pack for the collection as saved.
 *
 * Story 5.11a, edits stored in the collection only (no revision, client or intro is written):
 * a double-click on a free text opens it in place, and leaving it (or Enter on a one-line text)
 * saves the collection's words, marked "Modificato in questa raccolta" with **Ripristina testo
 * originale** ("Il testo originale è cambiato" with **Vedi originale** and **Usa originale** when
 * the original changed since). A client or case field, an image or a logo opens nothing. In
 * **Pagine** each part's pages can be moved within it and hidden (**Elimina dalla raccolta**); a
 * hidden page leaves the canvas for a strip with **Ripristina**, and a part keeps at least one
 * page. Edits are saved in the same queue as moves, shown at once and undone on failure.
 */
export function CollectionView({
  id,
  name,
  version,
  tags: initialTags,
  groups: initialGroups,
  edits: initialEdits,
  assets,
  candidates,
  tagOptions,
  actions,
  exportCounts,
}: CollectionViewProps) {
  const router = useRouter();
  const [message, say] = useStatusMessage();
  const [groups, setGroups] = useState(initialGroups);
  const [edits, setEdits] = useState(initialEdits);
  /** The free text open for typing, by its shown page's key. */
  const [editing, setEditing] = useState<{ pageKey: string; elementId: string } | null>(null);
  /** The open text's session (with the format it was opened in) and the words typed so far; null when none is open. */
  const session = useRef<{ pageKey: string; elementId: string; formatId: FormatId; typed: string | null } | null>(null);
  const [tags, setTags] = useState(initialTags);
  const [formatId, setFormatId] = useState<FormatId>("presentazione_16_9");
  const [preview, setPreview] = useState(false);
  const [slide, setSlide] = useState(0);
  const [instagram, setInstagram] = useState<InstagramView>("off");
  const [animateTexts, setAnimateTexts] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);
  const [removePending, setRemovePending] = useState(false);
  const [adding, setAdding] = useState(false);
  const [tagging, setTagging] = useState(false);
  const canvasRef = useRef<HTMLElement | null>(null);

  /** The version the server last confirmed: every write names it. */
  const versionRef = useRef(version);
  /** The order and edits the server last confirmed: a failed write puts them back. */
  const confirmed = useRef<{ groups: readonly CollectionGroup[]; edits: ViewEdits }>({ groups: initialGroups, edits: initialEdits });
  /** Writes run one after the other, so each names the version the one before returned. */
  const queue = useRef<Promise<void>>(Promise.resolve());
  /** Bumped by a failed move: the moves queued after it (made on the order it showed) are dropped. */
  const epoch = useRef(0);

  const segments = useMemo(() => collectionSegments(groups, formatId, edits), [groups, formatId, edits]);
  /** Every page of the format (hidden ones included) by its shown key, with its run. */
  const pageInfo = useMemo(() => new Map(segments.flatMap((s) => s.entries.map((e) => [e.page.pageKey, { segment: s, entry: e }] as const))), [segments]);
  const pages = useMemo<Page[]>(() => segments.flatMap((s) => s.pages), [segments]);
  const caseCount = groups.reduce((n, g) => n + g.cases.length, 0);
  const sectorLabel = (key: string) => tagOptions.sectors.find((s) => s.key === key)?.label ?? key;

  /**
   * Shows `next` at once and saves it with `save`, after the writes before it; a failure puts the
   * confirmed order and edits back, drops the writes queued after it, and says `failed(code)`.
   */
  const enqueue = useCallback(
    (
      next: { groups?: readonly CollectionGroup[]; edits?: ViewEdits },
      save: (expectedVersion: number) => Promise<ActionResult<{ version: number }>>,
      failed: (code: string | null) => string,
    ) => {
      if (next.groups !== undefined) setGroups(next.groups);
      if (next.edits !== undefined) setEdits(next.edits);
      const mine = epoch.current;
      queue.current = queue.current.then(async () => {
        if (mine !== epoch.current) return;
        let result: ActionResult<{ version: number }> | null;
        try {
          result = await save(versionRef.current);
        } catch {
          result = null;
        }
        if (result?.ok === true) {
          versionRef.current = result.value.version;
          confirmed.current = { groups: next.groups ?? confirmed.current.groups, edits: next.edits ?? confirmed.current.edits };
          return;
        }
        epoch.current += 1;
        setGroups(confirmed.current.groups);
        setEdits(confirmed.current.edits);
        const code = result?.ok === false ? result.error.code : null;
        if (isStale(code)) {
          // Changed elsewhere: retrying with this version can't work, so the page is read again.
          say(it.collections.stale);
          router.refresh();
        } else {
          say(failed(code));
          // Refused on the pages the page holds (a page, a text or the part changed since): read them again.
          if (next.edits !== undefined && code !== null && PAGE_DATA_REFUSALS.has(code)) router.refresh();
        }
      });
    },
    [router, say],
  );
  const move = (next: readonly CollectionGroup[], save: (expectedVersion: number) => Promise<Write>) => enqueue({ groups: next }, save, () => it.collection.orderFailed);

  const moveGroup = (clientId: string, to: number) => {
    const next = withGroupMoved(groups, clientId, to);
    if (next === groups) return;
    const group = next.find((g) => g.clientId === clientId)!;
    say(fill(it.collection.pages.moved, { name: group.clientName, n: next.indexOf(group) + 1, total: next.length }));
    move(next, (expectedVersion) => actions.moveGroup({ collectionId: id, expectedVersion, clientId, to: next.indexOf(group) }));
  };
  const moveCase = (caseId: string, to: number) => {
    const next = withCaseMoved(groups, caseId, to);
    if (next === groups) return;
    const group = groupOfCase(next, caseId)!;
    const at = group.cases.findIndex((c) => c.caseId === caseId);
    say(fill(it.collection.pages.moved, { name: group.cases[at]!.name, n: at + 1, total: group.cases.length }));
    move(next, (expectedVersion) => actions.moveItem({ collectionId: id, expectedVersion, caseId, to: at }));
  };

  // Story 5.11a: the collection's own edits.

  /** The page input of a run's page, as the edit actions take it. */
  const pageInput = (segment: ViewSegment, pageKey: string, expectedVersion: number) => ({
    collectionId: id,
    expectedVersion,
    part: partOfKey(segment.partKey),
    formatId,
    pageKey,
  });

  /** A free text double-clicked: it opens for typing; a field, an image or a logo opens nothing. */
  const requestEdit = (pageKey: string, elementId: string) => {
    const info = pageInfo.get(pageKey);
    if (info === undefined || freeTextIn(info.entry.page, elementId) === null) return;
    session.current = { pageKey, elementId, formatId, typed: null };
    setEditing({ pageKey, elementId });
  };

  /**
   * The open text left (blur, Enter on one line, Esc, or the format or Anteprima switched): its
   * words, normalised, are saved in the collection when they changed. Blank words are not saved
   * (the shown words come back). An edit whose original changed is saved again even with the same
   * words: its original is taken as read now. Only the session's own end counts: a second end of
   * the same session (focus leaving after a switch already saved it) does nothing.
   */
  const finishEdit = (pageKey: string, elementId: string) => {
    const open = session.current;
    if (open === null || open.pageKey !== pageKey || open.elementId !== elementId) return;
    session.current = null;
    setEditing(null);
    const info = open.formatId === formatId ? pageInfo.get(pageKey) : undefined;
    if (info === undefined) return;
    const { segment, entry } = info;
    const shown = freeTextIn(entry.page, elementId);
    if (shown === null) return;
    const text = open.typed === null ? shown : normaliseTyped(open.typed);
    const ref = { partKey: segment.partKey, formatId, pageKey: entry.pageKey, elementId };
    const changedOriginal = pageTextEdits(edits, segment.partKey, formatId, entry.pageKey).some((t) => t.elementId === elementId && t.originalChanged);
    if (text.trim() === "") return;
    if (text === shown && !changedOriginal) return;
    if (text.length > MAX_TEXT_CHARS) {
      // The page is drawn again from the saved words.
      say(fill(it.collection.edits.textTooLong, { max: MAX_TEXT_CHARS }));
      return;
    }
    if (text === originalText(groups, segment.partKey, formatId, entry.pageKey, elementId)) {
      enqueue(
        { edits: withTextEdit(edits, ref, null) },
        (v) => actions.restoreText({ ...pageInput(segment, entry.pageKey, v), elementId }),
        () => it.collection.edits.textFailed,
      );
      return;
    }
    enqueue(
      { edits: withTextEdit(edits, ref, text) },
      (v) => actions.setText({ ...pageInput(segment, entry.pageKey, v), elementId, text }),
      (code) => (code === "TEXT_NOT_EDITABLE" ? it.collection.edits.notEditable : it.collection.edits.textFailed),
    );
  };

  /** Saves the open text, if any, before the canvas changes under it (a format or Anteprima switch). */
  const finishOpenEdit = () => {
    const open = session.current;
    if (open !== null) finishEdit(open.pageKey, open.elementId);
  };

  /** **Ripristina testo originale** / **Usa originale**: the collection's words go. */
  const restoreText = (segment: ViewSegment, pageKey: string, elementId: string) =>
    enqueue(
      { edits: withTextEdit(edits, { partKey: segment.partKey, formatId, pageKey, elementId }, null) },
      (v) => actions.restoreText({ ...pageInput(segment, pageKey, v), elementId }),
      () => it.collection.edits.restoreFailed,
    );

  /** **Elimina dalla raccolta** (`hidden`) or **Ripristina** on a page of a run; a part keeps at least one page. */
  const setPageHidden = (segmentKey: string, pageKey: string, hidden: boolean) => {
    const segment = segments.find((s) => s.key === segmentKey);
    if (segment === undefined) return;
    if (hidden && shownPagesOfPart(segments, segment.partKey) <= 1) {
      say(it.collection.edits.lastPage);
      return;
    }
    enqueue(
      { edits: withPageHidden(edits, { partKey: segment.partKey, formatId, pageKey }, hidden) },
      (v) => actions.setPageHidden({ ...pageInput(segment, pageKey, v), hidden }),
      (code) => (code === "COLLECTION_LAST_PAGE" ? it.collection.edits.lastPage : hidden ? it.collection.edits.hideFailed : it.collection.edits.showFailed),
    );
  };

  /** A run's page at `from` moved to `to` (places within the run, hidden pages counted): the part's order is saved. */
  const movePage = (segmentKey: string, from: number, to: number) => {
    const segment = segments.find((s) => s.key === segmentKey);
    const part = segment === undefined ? undefined : partPagesOf(groups, segment.partKey);
    if (segment === undefined || part === undefined) return;
    const partOrder = orderedPages(part.formats[formatId] ?? [], segment.partKey, formatId, edits).map((p) => p.pageKey);
    const runKeys = segment.entries.map((e) => e.pageKey);
    const pageKeys = movedPageOrder(partOrder, runKeys, from, to);
    if (pageKeys === null) return;
    const at = Math.max(0, Math.min(runKeys.length - 1, to));
    say(fill(it.collection.pages.moved, { name: segment.entries[from]!.page.name, n: at + 1, total: runKeys.length }));
    enqueue(
      { edits: withPageOrder(edits, { partKey: segment.partKey, formatId, pageKeys }) },
      (v) => actions.setPageOrder({ collectionId: id, expectedVersion: v, part: partOfKey(segment.partKey), formatId, pageKeys }),
      () => it.collection.orderFailed,
    );
  };

  const canvasGroups = canvasGroupsOf(
    segments,
    groups,
    preview
      ? null
      : (segment, entry) => (
          <HiddenPageStrip
            key={`hidden-${entry.page.pageKey}`}
            formatId={formatId}
            pageKey={entry.page.pageKey}
            name={entry.page.name}
            onRestore={() => setPageHidden(segment.key, entry.pageKey, false)}
          />
        ),
  );

  /** The marks under a page's texts with the collection's words. */
  const pageExtras = (pageKey: string, host: RefObject<HTMLElement | null>) => {
    const info = pageInfo.get(pageKey);
    if (info === undefined) return null;
    const { segment, entry } = info;
    const marks = pageTextEdits(edits, segment.partKey, formatId, entry.pageKey)
      .filter((t) => freeTextIn(entry.page, t.elementId) !== null)
      .map((t) => ({
        elementId: t.elementId,
        originalChanged: t.originalChanged,
        original: originalText(groups, segment.partKey, formatId, entry.pageKey, t.elementId),
        onRestore: () => restoreText(segment, entry.pageKey, t.elementId),
      }));
    return marks.length === 0 ? null : <TextMarks host={host} marks={marks} />;
  };

  /** Enter on a one-line text saves it (it leaves the text); on a text of several lines it adds a line. */
  const onCanvasKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.hasAttribute("contenteditable")) return;
    if (typedText(target).includes("\n")) return;
    event.preventDefault();
    event.stopPropagation();
    target.blur();
  };

  const editingPage = editing === null ? undefined : pageInfo.get(editing.pageKey)?.entry.page;
  const editingBlock = editing === null || editingPage === undefined ? undefined : blockOf(editingPage, editing.elementId);

  /** After the queued moves: a write that changes what the page reads, then the page read again. */
  const writeThenRefresh = async (write: (expectedVersion: number) => Promise<Write>): Promise<Write | null> => {
    await queue.current;
    let result: Write | null;
    try {
      result = await write(versionRef.current);
    } catch {
      result = null;
    }
    if (result?.ok === true) {
      versionRef.current = result.value.version;
      router.refresh();
    } else if (result?.ok === false && (result.error.code === "STALE_COLLECTION" || result.error.code === "COLLECTION_NOT_FOUND")) {
      router.refresh();
    }
    return result;
  };

  const askRemove = (caseId: string) => {
    if (caseCount <= 1) {
      say(it.collection.remove.last);
      return;
    }
    setRemoving(caseId);
  };
  const remove = async () => {
    if (removing === null || removePending) return;
    setRemovePending(true);
    const caseId = removing;
    const result = await writeThenRefresh((expectedVersion) => actions.removeItems({ collectionId: id, expectedVersion, caseIds: [caseId] }));
    setRemovePending(false);
    setRemoving(null);
    if (result?.ok === true) return;
    const code = result?.ok === false ? result.error.code : null;
    say(code === "COLLECTION_LAST_ITEM" ? it.collection.remove.last : code === "STALE_COLLECTION" ? it.collections.stale : it.collection.remove.failed);
  };
  const add = async (caseIds: string[]): Promise<string | null> => {
    const result = await writeThenRefresh((expectedVersion) => actions.addItems({ collectionId: id, expectedVersion, caseIds }));
    if (result?.ok === true) return null;
    const code = result?.ok === false ? result.error.code : null;
    return code === "COLLECTION_FULL"
      ? it.collection.add.full
      : code === "CASE_NOT_COLLECTABLE"
        ? it.collection.add.notCollectable
        : code === "STALE_COLLECTION"
          ? it.collections.stale
          : it.collection.add.failed;
  };

  const removingCase = removing === null ? undefined : groupOfCase(groups, removing)?.cases.find((c) => c.caseId === removing);
  const selectSegment = (key: string) =>
    canvasRef.current?.querySelector(`[data-canvas-group="${key}"]`)?.scrollIntoView?.({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
  const pickFormat = (next: FormatId) => {
    finishOpenEdit();
    setFormatId(next);
    setSlide(0);
  };

  const previewLabel = preview ? it.configurator.preview.leave : it.configurator.preview.enter;
  return (
    <div className="flex h-dvh flex-col bg-surface text-foreground">
      <p className="m-auto max-w-prose p-8 text-center font-body text-base text-foreground lg:hidden">{it.collection.narrowScreen}</p>
      <div className="hidden min-h-0 flex-1 flex-col lg:flex">
        <header className="grid h-14 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 border-b border-border bg-surface-sidebar px-3">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href={collectionsHref()}
              aria-label={it.collection.back}
              className="grid size-8 shrink-0 place-items-center rounded-full text-foreground transition-[background-color,transform] duration-150 hover:bg-surface-hover active:scale-[0.94]"
            >
              <ArrowLeft aria-hidden="true" className="size-[18px]" />
            </Link>
            <h1 className="ml-1 min-w-0 truncate font-label text-sm font-semibold text-foreground-strong">{name}</h1>
            <span className="shrink-0 font-label text-xs text-foreground-muted tabular-nums">{fill(it.collection.count, { n: caseCount })}</span>
          </div>
          <div className="flex items-center gap-2">
            <FormatSwitch formatId={formatId} onFormat={pickFormat} />
            <button
              type="button"
              aria-pressed={preview}
              aria-label={previewLabel}
              title={previewLabel}
              onClick={() => {
                finishOpenEdit();
                setPreview(!preview);
                setSlide(0);
              }}
              className={cn(ICON_BUTTON, "size-8 bg-surface-raised text-foreground shadow-control aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary-hover")}
            >
              {preview ? <Pencil aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
            </button>
          </div>
          <div className="flex min-w-0 items-center justify-end gap-2">
            <ul aria-label={it.collection.tags.label} className="flex min-w-0 flex-wrap justify-end gap-1 overflow-hidden" style={{ maxHeight: "1.75rem" }}>
              {tags.businessLines.map((line) => (
                <li key={line} className="inline-flex items-center rounded-full bg-surface-control px-2 py-0.5 font-label text-xs text-foreground">
                  {it.businessLines[line]}
                </li>
              ))}
              {tags.industries.map((key) => (
                <li key={key} className="inline-flex items-center rounded-full bg-surface-selected px-2 py-0.5 font-label text-xs text-foreground">
                  {sectorLabel(key)}
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => setTagging(true)} className={cn(SECONDARY_ACTION, "h-8 shrink-0 px-3")}>
              <Tag aria-hidden="true" className="size-3.5" />
              {it.collection.tags.edit}
            </button>
            <CollectionExportButton
              collectionId={id}
              name={name}
              availableCount={exportCounts.available}
              unavailableCount={exportCounts.unavailable}
              currentFormat={formatId}
            />
          </div>
        </header>

        <main className="grid min-h-0 flex-1" style={{ gridTemplateColumns: `minmax(0,1fr) ${preview ? "0px" : "280px"}`, gridTemplateRows: "minmax(0,1fr)" }}>
          <div className="relative min-h-0" onKeyDownCapture={onCanvasKeyDown}>
            <StatusMessage message={message} />
            <Canvas
              formatId={formatId}
              template={segments[0]?.template ?? ""}
              pages={pages}
              groups={canvasGroups}
              assets={assets}
              values={segments[0]?.values ?? EMPTY_VALUES}
              selection={editing === null || editingBlock === undefined ? null : { pageKey: editing.pageKey, blockId: editingBlock, elementId: editing.elementId }}
              onSelect={noop}
              onPageInView={noop}
              trial={false}
              scrollRef={canvasRef}
              preview={preview}
              slide={slide}
              onStep={(delta) => setSlide((current) => Math.max(0, Math.min(pages.length - 1, current + delta)))}
              instagram={instagram}
              onInstagram={setInstagram}
              caption={name}
              animateTexts={animateTexts}
              onAnimateTexts={setAnimateTexts}
              reducedMotion={reducedMotion()}
              editable={!preview}
              editing={preview ? null : editing}
              onEditRequest={requestEdit}
              onTextInput={(pageKey, elementId, text) => {
                const open = session.current;
                if (open !== null && open.pageKey === pageKey && open.elementId === elementId) open.typed = text;
              }}
              onTextDone={finishEdit}
              pageExtras={pageExtras}
            />
          </div>
          <aside aria-label={it.collection.pages.label} hidden={preview} className="flex min-h-0 flex-col border-l border-border bg-surface-sidebar">
            <p className={cn(EYEBROW, "shrink-0 border-b border-border px-3.5 pt-3.5 pb-2.5")}>{it.collection.pages.label}</p>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <CollectionPagine
                formatId={formatId}
                groups={groups}
                segments={segments}
                assets={assets}
                onSelect={selectSegment}
                onMoveGroup={moveGroup}
                onMoveCase={moveCase}
                onRemove={askRemove}
                onAdd={() => setAdding(true)}
                onMovePage={movePage}
                onPageHidden={setPageHidden}
                onRefused={say}
              />
            </div>
          </aside>
        </main>
      </div>

      <Dialog
        open={removing !== null}
        onClose={() => {
          if (!removePending) setRemoving(null);
        }}
        title={fill(it.collection.remove.title, { name: removingCase?.name ?? "" })}
        description={it.collection.remove.description}
        actions={
          <>
            <button
              type="button"
              data-autofocus
              onClick={() => {
                if (!removePending) setRemoving(null);
              }}
              className={SECONDARY_ACTION}
            >
              {it.collection.remove.cancel}
            </button>
            <button type="button" aria-disabled={removePending || undefined} onClick={() => void remove()} className={DANGER_ACTION}>
              {it.collection.remove.confirm}
            </button>
          </>
        }
      />
      <AddCasesDialog open={adding} onClose={() => setAdding(false)} candidates={candidates} tags={tags} onAdd={add} />
      <TagsDialog
        key={tagging ? "open" : "closed"}
        open={tagging}
        tags={tags}
        options={tagOptions}
        onClose={() => setTagging(false)}
        onSave={async (next) => {
          await queue.current;
          let result: Awaited<ReturnType<CollectionActions["retag"]>> | null;
          try {
            result = await actions.retag({ collectionId: id, expectedVersion: versionRef.current, ...next });
          } catch {
            result = null;
          }
          if (result?.ok === true) {
            versionRef.current = result.value.version;
            setTags(next);
            return null;
          }
          if (result?.ok === false && result.error.code === "INVALID_INPUT") {
            const fields = refusedFields(result.error.fields);
            return fields.length > 0 ? fields : it.collection.tags.failed;
          }
          if (result?.ok === false && (result.error.code === "STALE_COLLECTION" || result.error.code === "COLLECTION_NOT_FOUND")) {
            router.refresh();
            return it.collections.stale;
          }
          return it.collection.tags.failed;
        }}
      />
    </div>
  );
}

/** **Modifica tag**: at least one business line and one industry, saved with the collection's version. */
function TagsDialog({
  open,
  tags,
  options,
  onClose,
  onSave,
}: {
  open: boolean;
  tags: TagsValue;
  options: TagOptions;
  onClose: () => void;
  /** Resolves to null when saved, the refused fields, or a failure to show. */
  onSave: (tags: TagsValue) => Promise<null | CollectionField[] | string>;
}) {
  const copy = it.collection.tags;
  const [value, setValue] = useState(tags);
  const [errors, setErrors] = useState<CollectionField[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const close = () => {
    if (!pending) onClose();
  };
  const save = async () => {
    if (pending) return;
    const wrong = invalidFields(value);
    setErrors(wrong);
    setFailure(null);
    if (wrong.length > 0) return;
    setPending(true);
    const result = await onSave(value);
    setPending(false);
    if (result === null) onClose();
    else if (typeof result === "string") setFailure(result);
    else setErrors(result);
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      wide
      title={copy.title}
      actions={
        <>
          <button type="button" onClick={close} className={SECONDARY_ACTION}>
            {copy.cancel}
          </button>
          <button type="button" aria-disabled={pending || undefined} onClick={() => void save()} className={cn(PRIMARY_ACTION, "aria-disabled:opacity-60")}>
            {copy.save}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <TagsFields value={value} onChange={setValue} options={options} errors={errors} disabled={pending} />
        <p role="alert" className="font-body text-sm text-danger empty:hidden">
          {failure ?? ""}
        </p>
      </div>
    </Dialog>
  );
}
