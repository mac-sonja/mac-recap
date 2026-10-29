"use client";

import { PanelLeft, PanelRight, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { ActionResult } from "@/app/_lib/action-result";
import type { ThemeChoice } from "@/app/_lib/theme";
import { CURRENT_SCHEMA_VERSION, type DocumentKind, type Page } from "@/modules/generation";
import { FORMAT_IDS, type BoundValues, type FormatId, type RenderAsset } from "@/modules/rendering";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { Canvas } from "./canvas";
import type { InstagramView } from "./instagram-overlay";
import { LeftPanel } from "./left-panel";
import { RightPanel } from "./right-panel";
import { findElement, resolveSelection, stepOut, type Selection } from "./selection";
import { StatusMessage, useStatusMessage } from "./status-message";
import { ICON_BUTTON, SOON_ID } from "./styles";
import { isOwnText, textElementAt, withText } from "./text-editing";
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
  /** No revision yet: the starter pages, with the *Bozza di prova* note. */
  trial: boolean;
  theme: ThemeChoice;
  /** The case whose head revision is edited (Story 4.3a). */
  caseId: string;
  /** The head revision and its document kind; null with no revision (the trial pages). */
  revision: (EditedRevision & { kind: DocumentKind }) | null;
  /** The autosave's server action. */
  onSave: (input: SaveInput) => Promise<ActionResult<{ version: number }>>;
}

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
 * Nothing is edited or saved here (Stories 4.3 onwards).
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
 * the case, and an approved case, are not edited yet: they say so.
 */
export function Configurator({ header, back, template, formats: initial, assets, values, trial, theme, caseId, revision, onSave }: ConfiguratorProps) {
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

  const undo = useCallback(() => {
    const changed = doc.undo();
    if (changed !== undefined && changed !== formatId) pickFormat(changed);
  }, [doc, formatId]); // eslint-disable-line react-hooks/exhaustive-deps -- pickFormat reads only state set here

  const redo = useCallback(() => {
    const changed = doc.redo();
    if (changed !== undefined && changed !== formatId) pickFormat(changed);
  }, [doc, formatId]); // eslint-disable-line react-hooks/exhaustive-deps -- as undo

  /** The latest handlers, for the key listener. */
  const keys = useRef({ undo, redo, requestEdit, element, selection });
  useEffect(() => {
    keys.current = { undo, redo, requestEdit, element, selection };
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
          <p
            role="alert"
            className="flex shrink-0 items-center justify-center gap-2 border-b border-border bg-surface-raised px-4 py-2 font-label text-[13px] font-medium text-danger"
          >
            <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
            {it.configurator.saveBanner}
          </p>
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
            onSoon={soon}
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
            onSoon={soon}
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
