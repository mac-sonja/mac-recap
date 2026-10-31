"use client";

import { PanelLeft, PanelRight, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { SECONDARY_ACTION } from "@/app/_components/button-styles";
import type { ActionResult } from "@/app/_lib/action-result";
import type { ThemeChoice } from "@/app/_lib/theme";
import { CURRENT_SCHEMA_VERSION, type Background, type Block, type DocumentKind, type Page, type TextGroupAlign } from "@/modules/generation";
import type { ListedAsset } from "@/modules/material";
import { FORMAT_IDS, type BoundValues, type DefaultPage, type FormatId, type Layout, type RenderAsset } from "@/modules/rendering";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { Canvas } from "./canvas";
import { applyDefaultPage, type GeneratedTexts } from "./default-pages";
import type { InstagramView } from "./instagram-overlay";
import { setTracks, type Axis } from "./grid-resize";
import { LeftPanel, type ElementKey } from "./left-panel";
import {
  addBlock,
  addElement,
  applyLayout,
  clearAssets,
  pasteBlock,
  placeMedia,
  removeSelection,
  setBackground,
  shuffleLayout,
  type MediaTarget,
  type PageEdit,
} from "./page-editing";
import { isMedia, type MediaUploadRules } from "./media-files";
import { RightPanel, type RightTab } from "./right-panel";
import { findElement, resolveSelection, stepOut, type Selection } from "./selection";
import { StatusMessage, useStatusMessage } from "./status-message";
import { ICON_BUTTON, SOON_ID } from "./styles";
import { isOwnText, textElementAt, withGroupAlign, withText, withTextSettings, type TextSettings } from "./text-editing";
import { TopBar, type ConfiguratorHeader } from "./top-bar";
import { useDocument, type EditedRevision, type Formats, type SaveInput } from "./use-document";

export interface ConfiguratorProps {
  /** The top bar's document: name, code and status (a case today; a client's intro or file later). */
  header: ConfiguratorHeader;
  back: { href: string; label: string };
  /** The document's template ref (`mac-case@1`). */
  template: string;
  /** Each registry format's own pages, in order. */
  formats: Readonly<Record<FormatId, readonly Page[]>>;
  /** By asset id; an asset left out (rendition not ready) draws an empty cell. */
  assets: Readonly<Record<string, RenderAsset>>;
  values: BoundValues;
  /** The case's generated texts per format, by template key: what Pagine di default fills a page with (Story 4.4c). */
  generatedTexts: GeneratedTexts;
  /** The case's images a default page may place, oldest first (those the revision already uses). */
  images: readonly string[];
  /** No revision yet: the starter pages, with the *Bozza di prova* note. */
  trial: boolean;
  theme: ThemeChoice;
  /** The case whose head revision is edited (Story 4.3a). */
  caseId: string;
  /** The head revision and its document kind; null with no revision (the trial pages). */
  revision: (EditedRevision & { kind: DocumentKind }) | null;
  /** The autosave's server action. */
  onSave: (input: SaveInput) => Promise<ActionResult<{ version: number }>>;
  /** The case's images and videos, oldest first: the Media tab's files (Story 4.5a). */
  media: readonly ListedAsset[];
  /** What the Media tab's drop zone uploads (Story 2.7's rules, images and videos only). */
  mediaRules: MediaUploadRules;
  /** The render assets of files listed after the page loaded (Story 4.5b): a new upload can be drawn once its rendition is ready. */
  onRenderAssets?: (input: { caseId: string; assetIds: string[] }) => Promise<ActionResult<Record<string, RenderAsset>>>;
}

/** A fresh id for a new block or element. */
const newId = () => crypto.randomUUID();

/** Whether the person asked for reduced motion (a jump instead of a smooth scroll). */
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/** A key press that belongs to a field being typed in, not to the canvas (a checkbox or radio is not typed in). */
const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || target.closest('input:not([type="checkbox"], [type="radio"]), textarea, select') !== null);

/**
 * The configurator frame (Story 4.2a, C40, mockup `configurator.html`): full screen,
 * no sidebar. Top bar; left panel (312 px), canvas and right panel (224 px). Each panel
 * hides from its own bar and comes back from the canvas edge, focus following the
 * button that appears. The format switch shows that format's own pages. Selection:
 * a click frames a block or selects an element (its block framed); Esc steps out from
 * element to block to page to nothing. Messages show at the top of the canvas for a
 * few seconds (`role="status"`). Below 1024 px only the larger-screen message shows.
 *
 * Anteprima (Story 4.2b, C37): the top bar's eye shows the same canvas without the
 * panels or the selection (kept for the return); Carosello and Video become one
 * slideshow (← →), and Video can show Instagram's Reel or Story over the page (C34).
 * Esc goes back to the editor. In the Video editor, **Animazione testi** stops the loop.
 *
 * Editing (Story 4.3a): a double-click on a text, or Enter with it selected, types in it
 * on the page; in Anteprima a click does. Only the format in view changes. The document
 * saves itself (`useDocument`), ⌘Z and ⇧⌘Z (or the top bar) undo and redo every edit,
 * and a block whose text no longer fits shows a marker. Texts bound to the client or
 * the case, and an approved case, are not edited yet: they say so. The left panel sets
 * a selected text's style, alignment, colour and columns, and a Testi group's alignment
 * in its block (Story 4.3b), each change one undo step. Elementi adds an element to the
 * selected block, or a block; ⌘C, ⌘X and ⌘V copy, cut and paste a block; Backspace,
 * Delete or **Rimuovi** removes the selection (Story 4.3c). **Pagine di default** lays the
 * tools' page out as a template page, filled with the generated texts (Story 4.4c).
 * The right panel's **Media** tab lists, stars and uploads the case's images and videos
 * (Story 4.5a). A tile dragged onto an image or video replaces its file, dropped elsewhere
 * in a block adds it there; a tile clicked fills the selected image or video, else joins
 * the selected block; the left panel's **Sostituisci dai Media** opens the tab (Story 4.5b).
 * A file uploaded meanwhile gets its render asset once its rendition is ready. A save
 * refused for a file no longer in the Media names it and offers to take it off the page.
 */
export function Configurator({
  header,
  back,
  template,
  formats: initial,
  assets: initialAssets,
  values,
  generatedTexts,
  images,
  trial,
  theme,
  caseId,
  revision,
  onSave,
  media,
  mediaRules,
  onRenderAssets,
}: ConfiguratorProps) {
  const router = useRouter();
  const doc = useDocument({
    caseId,
    revision,
    base: { schemaVersion: CURRENT_SCHEMA_VERSION, kind: revision?.kind ?? "case_history", template },
    initial: initial as Formats,
    save: onSave,
    onStale: () => router.refresh(),
  });
  const formats = doc.formats;
  const editable = revision !== null && revision.editable && !trial;
  const [editing, setEditing] = useState<{ pageKey: string; elementId: string } | null>(null);
  /** One text editing session: its changes are one undo step. */
  const session = useRef(0);
  const [formatId, setFormatId] = useState<FormatId>(FORMAT_IDS[0]);
  const [selection, setSelection] = useState<Selection>(null);
  const [inView, setInView] = useState<string | null>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [message, say] = useStatusMessage();
  const [preview, setPreview] = useState(false);
  const [slide, setSlide] = useState(0);
  const [instagram, setInstagram] = useState<InstagramView>("off");
  const [textAnim, setTextAnim] = useState(true);
  /** Reduced motion, read when Anteprima opens: the slideshow then switches without a transition. */
  const [still, setStill] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab>("pages");
  /** The render assets: the page's, then those of files uploaded since (Story 4.5b). */
  const [assets, setAssets] = useState(initialAssets);
  /** The case's images and videos as last listed. */
  const [files, setFiles] = useState(media);
  /** Every file name listed this session, by lowercased id: a file deleted since is still named in the refused-save banner. */
  const [names, setNames] = useState<ReadonlyMap<string, string>>(() => new Map(media.map((f) => [f.id.toLowerCase(), f.originalFileName])));
  /** Ids whose render asset is being read. */
  const reading = useRef(new Set<string>());
  /** The latest assets: the Media tab's polling may call an older `listed`. */
  const assetsNow = useRef(assets);
  useEffect(() => {
    assetsNow.current = assets;
  });
  const mediaTab = useRef<HTMLButtonElement>(null);
  /** **Sostituisci dai Media** pressed: focus the Media tab once it shows. */
  const focusMedia = useRef(false);

  const canvasRef = useRef<HTMLElement>(null);
  const hideLeft = useRef<HTMLButtonElement>(null);
  const hideRight = useRef<HTMLButtonElement>(null);
  const showLeft = useRef<HTMLButtonElement>(null);
  const showRight = useRef<HTMLButtonElement>(null);
  const previewButton = useRef<HTMLButtonElement>(null);
  /** On entering or leaving Anteprima: the page to bring back to the middle, and whether Esc moved focus. */
  const previewAnchor = useRef<{ pageKey: string | null; focus: boolean } | null>(null);
  /** The button to focus once the panel toggle has rendered. */
  const focusNext = useRef<RefObject<HTMLButtonElement | null> | null>(null);

  const pages = formats[formatId];
  const { page: selectedPage, block, element } = resolveSelection(pages, selection);
  // The page tools act on the selected page, else on the page in view, else on the first.
  const toolPage = selectedPage ?? pages.find((p) => p.pageKey === inView) ?? pages[0];

  const slideshow = preview && formatId !== "presentazione_16_9";
  const soon = useCallback((tool: string) => say(fill(it.configurator.soonMessage, { tool })), [say]);

  function pickFormat(next: FormatId) {
    if (next === formatId) return;
    setEditing(null);
    setFormatId(next);
    setSelection(null);
    setInView(null);
    setSlide(0);
    canvasRef.current?.scrollTo?.({ top: 0 });
  }

  function togglePreview(on: boolean, focus = false) {
    // Keep the canvas on the same page: leaving a slideshow, the page it showed; otherwise
    // the selected page, else the page in view.
    const shown = slideshow ? pages[Math.max(0, Math.min(pages.length - 1, slide))]?.pageKey : undefined;
    previewAnchor.current = { pageKey: shown ?? selectedPage?.pageKey ?? inView, focus };
    if (on) {
      // The slideshow starts at the selected page, else at the first.
      setSlide(Math.max(0, selectedPage === undefined ? 0 : pages.indexOf(selectedPage)));
      setStill(reducedMotion());
    }
    setPreview(on);
  }

  /** The latest `togglePreview(false, true)`, for the key handler. */
  const leavePreview = useRef(() => {});
  useEffect(() => {
    leavePreview.current = () => togglePreview(false, true);
  });

  const step = useCallback(
    (delta: -1 | 1) => setSlide((current) => Math.max(0, Math.min(pages.length - 1, current + delta))),
    [pages.length],
  );

  useLayoutEffect(() => {
    const anchor = previewAnchor.current;
    previewAnchor.current = null;
    if (anchor === null) return;
    if (anchor.pageKey !== null) {
      canvasRef.current?.querySelector(`[data-canvas-page="${anchor.pageKey}"]`)?.scrollIntoView?.({ block: "center", behavior: "auto" });
    }
    // Esc unmounted the focused slideshow or Instagram button: focus goes to the eye.
    if (anchor.focus) previewButton.current?.focus();
  }, [preview]);

  function selectPage(pageKey: string) {
    setSelection({ pageKey });
    const node = canvasRef.current?.querySelector(`[data-canvas-page="${pageKey}"]`);
    node?.scrollIntoView?.({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
  }

  function toggleLeft(open: boolean) {
    focusNext.current = open ? hideLeft : showLeft;
    setLeftOpen(open);
  }

  function toggleRight(open: boolean) {
    focusNext.current = open ? hideRight : showRight;
    setRightOpen(open);
  }

  useEffect(() => {
    const target = focusNext.current;
    focusNext.current = null;
    target?.current?.focus();
  }, [leftOpen, rightOpen]);

  /** A double-click (or Enter) on an element: a text with its own words opens for typing; any other text says it can't yet. */
  const requestEdit = useCallback(
    (pageKey: string, elementId: string) => {
      const text = textElementAt(formats[formatId], pageKey, elementId);
      if (text === undefined) return;
      if (!editable || !isOwnText(text)) {
        say(it.configurator.editSoon);
        return;
      }
      session.current += 1;
      setSelection((current) => (current?.pageKey === pageKey && current.elementId === elementId ? current : selectionOf(formats[formatId], pageKey, elementId)));
      setEditing({ pageKey, elementId });
    },
    [editable, formatId, formats, say],
  );

  const textInput = useCallback(
    (pageKey: string, elementId: string, text: string) => {
      const pages = formats[formatId];
      const next = withText(pages, pageKey, elementId, text);
      if (next === pages) return;
      doc.change({ ...formats, [formatId]: next }, formatId, `text-${session.current}-${pageKey}-${elementId}`);
    },
    [doc, formatId, formats],
  );

  const textDone = useCallback(() => {
    session.current += 1;
    setEditing(null);
    doc.flush();
  }, [doc]);

  /** A text panel or Testi group control on the selected element: one undo step, in the format in view. */
  const applyToSelection = useCallback(
    (edit: (pages: readonly Page[], pageKey: string, elementId: string) => readonly Page[]) => {
      if (!editable || selection?.elementId === undefined) return;
      const current = formats[formatId];
      const next = edit(current, selection.pageKey, selection.elementId);
      if (next !== current) doc.change({ ...formats, [formatId]: next }, formatId);
    },
    [doc, editable, formatId, formats, selection],
  );
  /** The block ⌘C or ⌘X took, for ⌘V (any page, any format). */
  const clipboard = useRef<Block | null>(null);

  /** A page edit in the format in view (one undo step), its result selected; a refusal says why. */
  const applyPageEdit = useCallback(
    (edit: PageEdit) => {
      if (!edit.ok) {
        if (edit.reason === "noBlock") say(it.configurator.edit.needBlock);
        else if (edit.reason === "pageFull") say(it.configurator.edit.pageFull);
        else if (edit.reason === "over") say(edit.over === 1 ? it.configurator.edit.layoutOverOne : fill(it.configurator.edit.layoutOver, { k: edit.over }));
        else if (edit.reason === "empty") say(it.configurator.edit.defaultEmpty);
        else if (edit.reason === "blockFull") say(it.configurator.edit.blockFull);
        else if (edit.reason === "offBlock") say(it.configurator.media.dropOffBlock);
        return false;
      }
      doc.change({ ...formats, [formatId]: edit.pages }, formatId);
      setSelection(edit.selection);
      return true;
    },
    [doc, formatId, formats, say],
  );

  /** An Elementi button: Blocco after the selected block (else at the end of the tools' page), anything else into the selected block. */
  const addFromElementi = useCallback(
    (key: ElementKey) => {
      if (!editable || key === "animation") return;
      const current = formats[formatId];
      if (key !== "block") {
        applyPageEdit(addElement(current, selection, key, newId));
        return;
      }
      const pageKey = selection?.pageKey ?? toolPage?.pageKey;
      if (pageKey !== undefined) applyPageEdit(addBlock(current, pageKey, selection?.blockId, formatId, template, newId));
    },
    [applyPageEdit, editable, formatId, formats, selection, template, toolPage],
  );

  /** A Layout thumbnail (Story 4.4a): the tools' page takes it, then is selected. */
  const pickLayout = useCallback(
    (layout: Layout) => {
      if (editable && toolPage !== undefined) applyPageEdit(applyLayout(formats[formatId], toolPage.pageKey, layout, newId));
    },
    [applyPageEdit, editable, formatId, formats, toolPage],
  );

  /** A Pagine di default button (Story 4.4c): the tools' page laid out as that template page, then selected. */
  const pickDefaultPage = useCallback(
    (defaultPage: DefaultPage) => {
      if (!editable || toolPage === undefined) return;
      applyPageEdit(
        applyDefaultPage(formats[formatId], toolPage.pageKey, defaultPage, {
          texts: generatedTexts[formatId] ?? {},
          pool: images,
          resultRows: values.case.results.length,
          hasTestimonial: values.case.testimonial !== null,
          newId,
        }),
      );
    },
    [applyPageEdit, editable, formatId, formats, generatedTexts, images, toolPage, values],
  );

  /** **Mescola**: the tools' page on its next layout; the selection stays. */
  const shuffle = useCallback(() => {
    if (!editable || toolPage === undefined) return;
    const current = formats[formatId];
    const next = shuffleLayout(current, toolPage.pageKey, formatId, template);
    if (next !== current) doc.change({ ...formats, [formatId]: next }, formatId);
  }, [doc, editable, formatId, formats, template, toolPage]);

  /** Sfondo: the selected block's background, else the tools' page's. */
  const background = useCallback(
    (value: Background) => {
      if (!editable || toolPage === undefined) return;
      const current = formats[formatId];
      const next = setBackground(current, toolPage.pageKey, block?.blockId, value);
      if (next !== current) doc.change({ ...formats, [formatId]: next }, formatId);
    },
    [block, doc, editable, formatId, formats, toolPage],
  );

  /** A dragged border released (Story 4.4b): the page's new track sizes, one undo step; the selection stays. */
  const resize = useCallback(
    (pageKey: string, axis: Axis, sizes: number[]) => {
      if (!editable) return;
      const current = formats[formatId];
      const next = setTracks(current, pageKey, axis, sizes);
      if (next !== current) doc.change({ ...formats, [formatId]: next }, formatId);
    },
    [doc, editable, formatId, formats],
  );

  /** A Media file put at `target` (Story 4.5b): a drop goes before the element under it, a click at the end of the block. */
  const placeFile = useCallback(
    (target: MediaTarget, assetId: string, at: "before" | "end") => {
      if (!editable) return;
      const id = assetId.toLowerCase();
      const file = files.find((f) => f.id.toLowerCase() === id);
      if (file === undefined || !isMedia(file)) return;
      applyPageEdit(placeMedia(formats[formatId], target, { id: file.id, kind: file.kind as "image" | "video" }, at, newId));
    },
    [applyPageEdit, editable, files, formatId, formats],
  );

  /** A tile clicked: it fills the selected image or video, else joins the selected block. */
  const pickFile = useCallback(
    (file: ListedAsset) => {
      if (selection === null || block === undefined) {
        say(it.configurator.edit.needBlock);
        return;
      }
      placeFile(selection, file.id, "end");
    },
    [block, placeFile, say, selection],
  );

  /** The Media tab read the files again: keep them, and read the render assets of new ones. */
  const listed = useCallback(
    (fresh: readonly ListedAsset[]) => {
      setFiles(fresh);
      setNames((current) => new Map([...current, ...fresh.map((f) => [f.id.toLowerCase(), f.originalFileName] as const)]));
      if (onRenderAssets === undefined) return;
      const missing = fresh.filter((f) => !(f.id in assetsNow.current) && !reading.current.has(f.id)).map((f) => f.id);
      if (missing.length === 0) return;
      for (const id of missing) reading.current.add(id);
      void onRenderAssets({ caseId, assetIds: missing })
        .then((result) => {
          if (result.ok && Object.keys(result.value).length > 0) setAssets((current) => ({ ...current, ...result.value }));
        })
        .catch(() => undefined)
        // A file still without a rendition is asked for again at the next listing.
        .finally(() => {
          for (const id of missing) reading.current.delete(id);
        });
    },
    [caseId, onRenderAssets],
  );

  /** **Sostituisci dai Media** / **Scegli dai Media**: the right panel shows, on its Media tab. */
  const openMedia = useCallback(() => {
    // Already showing: nothing re-renders, so focus it now.
    if (rightOpen && rightTab === "media") {
      mediaTab.current?.focus();
      return;
    }
    focusMedia.current = true;
    setRightOpen(true);
    setRightTab("media");
  }, [rightOpen, rightTab]);

  useEffect(() => {
    if (!focusMedia.current) return;
    focusMedia.current = false;
    mediaTab.current?.focus();
  }, [rightOpen, rightTab]);

  /** **Togli dalla pagina** on the refused-file banner: those files' images and videos emptied, in every format (one undo step). */
  const removeRefused = useCallback(() => {
    if (doc.refused === null) return;
    const next = Object.fromEntries(Object.entries(formats).map(([id, pages]) => [id, clearAssets(pages, doc.refused!)])) as Formats;
    const changed = (Object.keys(next) as FormatId[]).filter((id) => next[id] !== formats[id]);
    if (changed.length === 0) return;
    doc.change(next, changed.includes(formatId) ? formatId : changed[0]!);
    say(it.configurator.media.missing.removed);
  }, [doc, formatId, formats, say]);

  /** Removes the selected element or block; false when there is nothing to remove. */
  const removeSelected = useCallback(() => {
    if (!editable) return false;
    const element = selection?.elementId !== undefined;
    if (!applyPageEdit(removeSelection(formats[formatId], selection, formatId, template))) return false;
    say(element ? it.configurator.edit.elementRemoved : it.configurator.edit.blockRemoved);
    return true;
  }, [applyPageEdit, editable, formatId, formats, say, selection, template]);

  /** ⌘C / ⌘X on a selected block; false when no block itself is selected. */
  const copyBlock = useCallback(
    (cut: boolean) => {
      if (!editable || selection?.blockId === undefined || selection.elementId !== undefined) return false;
      const { block: selected } = resolveSelection(formats[formatId], selection);
      if (selected === undefined) return false;
      clipboard.current = structuredClone(selected);
      if (!cut) say(it.configurator.edit.copied);
      else if (applyPageEdit(removeSelection(formats[formatId], selection, formatId, template))) say(it.configurator.edit.cut);
      return true;
    },
    [applyPageEdit, editable, formatId, formats, say, selection, template],
  );

  /** ⌘V: the copied block after the selected one, else at the end of the selected page. */
  const paste = useCallback(() => {
    if (!editable || clipboard.current === null || selection === null) return false;
    applyPageEdit(pasteBlock(formats[formatId], selection, clipboard.current, formatId, template, newId));
    return true;
  }, [applyPageEdit, editable, formatId, formats, selection, template]);

  const textSettings = useCallback((settings: TextSettings) => applyToSelection((p, k, id) => withTextSettings(p, k, id, settings)), [applyToSelection]);
  const groupAlign = useCallback((align: TextGroupAlign) => applyToSelection((p, k, id) => withGroupAlign(p, k, id, align)), [applyToSelection]);

  const undo = useCallback(() => {
    const changed = doc.undo();
    if (changed !== undefined && changed !== formatId) pickFormat(changed);
  }, [doc, formatId]); // eslint-disable-line react-hooks/exhaustive-deps -- pickFormat reads only state set here

  const redo = useCallback(() => {
    const changed = doc.redo();
    if (changed !== undefined && changed !== formatId) pickFormat(changed);
  }, [doc, formatId]); // eslint-disable-line react-hooks/exhaustive-deps -- as undo

  /** The latest handlers, for the key listener. */
  const keys = useRef({ undo, redo, requestEdit, element, selection, removeSelected, copyBlock, paste });
  useEffect(() => {
    keys.current = { undo, redo, requestEdit, element, selection, removeSelected, copyBlock, paste };
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || typing(event.target)) return;
      // ⌘Z / ⇧⌘Z (Ctrl elsewhere), in the editor and in Anteprima; inside a text the browser's own undo applies.
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) keys.current.redo();
        else keys.current.undo();
        return;
      }
      if (preview) {
        // In Anteprima Esc goes back to the editor, never a selection step; ← → step the slideshow.
        if (event.key === "Escape") leavePreview.current();
        else if (slideshow && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
          // ⌥/⌘/Ctrl + arrow belongs to the browser (back, forward, word jumps).
          if (event.altKey || event.metaKey || event.ctrlKey) return;
          event.preventDefault();
          step(event.key === "ArrowRight" ? 1 : -1);
        }
        return;
      }
      const mod = event.metaKey || event.ctrlKey;
      // Backspace or Delete removes the selected element or block; a held key removes only once
      // (the element's block is selected next, and must not go with it).
      if (!mod && (event.key === "Backspace" || event.key === "Delete")) {
        if (event.repeat) event.preventDefault();
        else if (keys.current.removeSelected()) event.preventDefault();
        return;
      }
      // ⌘C, ⌘X and ⌘V copy, cut and paste a block; with no block, or text highlighted, they stay the browser's.
      const key = event.key.toLowerCase();
      if (mod && !event.altKey && !event.shiftKey && (key === "c" || key === "x" || key === "v")) {
        const highlighted = document.getSelection?.()?.isCollapsed === false;
        if (key === "v" ? keys.current.paste() : !highlighted && keys.current.copyBlock(key === "x")) event.preventDefault();
        return;
      }
      if (event.key === "Escape") setSelection((current) => stepOut(current));
      // Enter on a selected text types in it.
      const { element: selected, selection: at } = keys.current;
      const onControl = event.target instanceof Element && event.target.closest("button, a, [role='button']") !== null;
      if (event.key === "Enter" && !onControl && selected?.type === "text" && at?.elementId !== undefined) {
        event.preventDefault();
        keys.current.requestEdit(at.pageKey, at.elementId);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [preview, slideshow, step]);

  return (
    <div data-editable={editable} className="flex h-dvh flex-col bg-surface text-foreground">
      <p className="m-auto max-w-prose p-8 text-center font-body text-base text-foreground lg:hidden">{it.configurator.narrowScreen}</p>

      <div className="hidden min-h-0 flex-1 flex-col lg:flex">
        <span id={SOON_ID} hidden>
          {it.configurator.soon}
        </span>
        <TopBar
          header={header}
          back={back}
          formatId={formatId}
          onFormat={pickFormat}
          onSoon={soon}
          preview={preview}
          onPreview={togglePreview}
          previewRef={previewButton}
          save={doc.save}
          canUndo={doc.canUndo}
          canRedo={doc.canRedo}
          onUndo={undo}
          onRedo={redo}
        />
        {doc.banner && (
          <div
            role="alert"
            className="flex shrink-0 items-center justify-center gap-2 border-b border-border bg-surface-raised px-4 py-2 font-label text-[13px] font-medium text-danger"
          >
            <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
            {doc.refused === null ? it.configurator.saveBanner : missingMessage(doc.refused, names)}
            {doc.refused !== null && canClear(formats, doc.refused) && (
              <button type="button" onClick={removeRefused} className={cn(SECONDARY_ACTION, "ml-2 h-7 px-3 text-[12.5px]")}>
                {it.configurator.media.missing.remove}
              </button>
            )}
          </div>
        )}

        <main
          className="grid min-h-0 flex-1"
          style={{
            gridTemplateColumns: `${leftOpen && !preview ? "312px" : "0px"} minmax(0,1fr) ${rightOpen && !preview ? "224px" : "0px"}`,
            gridTemplateRows: "minmax(0,1fr)",
          }}
        >
          {/* Hidden, not unmounted: the theme switch and the panels' own state survive a hide and Anteprima. */}
          <LeftPanel
            hidden={!leftOpen || preview}
            formatId={formatId}
            template={template}
            page={toolPage}
            block={block}
            element={element}
            theme={theme}
            editable={editable}
            onTextSettings={textSettings}
            onGroupAlign={groupAlign}
            onAddElement={addFromElementi}
            onRemove={removeSelected}
            onLayout={pickLayout}
            onShuffle={shuffle}
            onDefaultPage={pickDefaultPage}
            onBackground={background}
            onBadColour={() => say(it.configurator.edit.badColour)}
            onSoon={soon}
            files={files}
            onOpenMedia={openMedia}
            onHide={() => toggleLeft(false)}
            hideRef={hideLeft}
          />

          <div className="relative col-start-2 row-start-1 min-h-0">
            <Canvas
              formatId={formatId}
              template={template}
              pages={pages}
              assets={assets}
              values={values}
              selection={selection}
              onSelect={setSelection}
              onPageInView={setInView}
              trial={trial}
              scrollRef={canvasRef}
              preview={preview}
              slide={slide}
              onStep={step}
              instagram={instagram}
              onInstagram={setInstagram}
              caption={header.name}
              animateTexts={textAnim}
              onAnimateTexts={setTextAnim}
              reducedMotion={still}
              editable={editable}
              editing={preview ? null : editing}
              onEditRequest={requestEdit}
              onTextInput={textInput}
              onTextDone={textDone}
              onResize={resize}
              onPlaceMedia={editable ? (target, assetId) => placeFile(target, assetId, "before") : undefined}
            />
            <StatusMessage message={message} />
            {!leftOpen && !preview && (
              <button
                ref={showLeft}
                type="button"
                onClick={() => toggleLeft(true)}
                aria-label={it.configurator.panels.showLeft}
                title={it.configurator.panels.show}
                className={cn(ICON_BUTTON, "absolute top-3 left-3 z-10 bg-surface-raised text-foreground shadow-card")}
              >
                <PanelLeft aria-hidden="true" className="size-4" />
              </button>
            )}
            {!rightOpen && !preview && (
              <button
                ref={showRight}
                type="button"
                onClick={() => toggleRight(true)}
                aria-label={it.configurator.panels.showRight}
                title={it.configurator.panels.show}
                className={cn(ICON_BUTTON, "absolute top-3 right-3 z-10 bg-surface-raised text-foreground shadow-card")}
              >
                <PanelRight aria-hidden="true" className="size-4" />
              </button>
            )}
          </div>

          <RightPanel
            hidden={!rightOpen || preview}
            formatId={formatId}
            template={template}
            pages={pages}
            assets={assets}
            values={values}
            currentPageKey={selectedPage?.pageKey}
            onSelectPage={selectPage}
            caseId={caseId}
            media={media}
            mediaRules={mediaRules}
            say={say}
            tab={rightTab}
            onTab={setRightTab}
            mediaTabRef={mediaTab}
            onPickMedia={editable ? pickFile : undefined}
            onMediaListed={listed}
            onHide={() => toggleRight(false)}
            hideRef={hideRight}
          />
        </main>
      </div>
    </div>
  );
}

/** The selection of element `elementId` of page `pageKey`, with its block. */
function selectionOf(pages: readonly Page[], pageKey: string, elementId: string): Selection {
  const page = pages.find((p) => p.pageKey === pageKey);
  const block = page?.blocks.find((b) => findElement(b.elements, elementId) !== undefined);
  return block === undefined ? { pageKey } : { pageKey, blockId: block.blockId, elementId };
}

/** The refused-file banner's words: the file's name when it was listed this session, else "Un file"; several by count. */
function missingMessage(refused: readonly string[], names: ReadonlyMap<string, string>): string {
  const t = it.configurator.media.missing;
  if (refused.length > 1) return fill(t.many, { n: refused.length });
  return fill(t.one, { name: names.get(refused[0]!.toLowerCase()) ?? t.unknown });
}

/** Whether **Togli dalla pagina** would change anything: some image or video shows a refused file. */
const canClear = (formats: Formats, refused: readonly string[]) => Object.values(formats).some((pages) => clearAssets(pages, refused) !== pages);
