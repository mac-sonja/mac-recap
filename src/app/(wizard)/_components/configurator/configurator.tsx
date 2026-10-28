"use client";

import { PanelLeft, PanelRight } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { ThemeChoice } from "@/app/_lib/theme";
import type { Page } from "@/modules/generation";
import { FORMAT_IDS, type BoundValues, type FormatId, type RenderAsset } from "@/modules/rendering";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { Canvas } from "./canvas";
import type { InstagramView } from "./instagram-overlay";
import { LeftPanel } from "./left-panel";
import { RightPanel } from "./right-panel";
import { resolveSelection, stepOut, type Selection } from "./selection";
import { StatusMessage, useStatusMessage } from "./status-message";
import { ICON_BUTTON, SOON_ID } from "./styles";
import { TopBar, type ConfiguratorHeader } from "./top-bar";

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
 */
export function Configurator({ header, back, template, formats, assets, values, trial, theme }: ConfiguratorProps) {
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

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || typing(event.target)) return;
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
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [preview, slideshow, step]);

  return (
    <div className="flex h-dvh flex-col bg-surface text-foreground">
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
        />

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
