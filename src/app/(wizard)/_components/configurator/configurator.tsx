"use client";

import { PanelLeft, PanelRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { ThemeChoice } from "@/app/_lib/theme";
import type { Page } from "@/modules/generation";
import { FORMAT_IDS, type BoundValues, type FormatId, type RenderAsset } from "@/modules/rendering";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { Canvas } from "./canvas";
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

/** A key press that belongs to a field being typed in, not to the canvas. */
const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select") !== null);

/**
 * The configurator frame (Story 4.2a, C40, mockup `configurator.html`): full screen,
 * no sidebar. Top bar; left panel (312 px), canvas and right panel (224 px). Each panel
 * hides from its own bar and comes back from the canvas edge, focus following the
 * button that appears. The format switch shows that format's own pages. Selection:
 * a click frames a block or selects an element (its block framed); Esc steps out from
 * element to block to page to nothing. Messages show at the top of the canvas for a
 * few seconds (`role="status"`). Below 1024 px only the larger-screen message shows.
 * Nothing is edited or saved here (Stories 4.3 onwards).
 */
export function Configurator({ header, back, template, formats, assets, values, trial, theme }: ConfiguratorProps) {
  const [formatId, setFormatId] = useState<FormatId>(FORMAT_IDS[0]);
  const [selection, setSelection] = useState<Selection>(null);
  const [inView, setInView] = useState<string | null>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [message, say] = useStatusMessage();

  const canvasRef = useRef<HTMLElement>(null);
  const hideLeft = useRef<HTMLButtonElement>(null);
  const hideRight = useRef<HTMLButtonElement>(null);
  const showLeft = useRef<HTMLButtonElement>(null);
  const showRight = useRef<HTMLButtonElement>(null);
  /** The button to focus once the panel toggle has rendered. */
  const focusNext = useRef<RefObject<HTMLButtonElement | null> | null>(null);

  const pages = formats[formatId];
  const { page: selectedPage, block, element } = resolveSelection(pages, selection);
  // The page tools act on the selected page, else on the page in view, else on the first.
  const toolPage = selectedPage ?? pages.find((p) => p.pageKey === inView) ?? pages[0];

  const soon = useCallback((tool: string) => say(fill(it.configurator.soonMessage, { tool })), [say]);

  function pickFormat(next: FormatId) {
    if (next === formatId) return;
    setFormatId(next);
    setSelection(null);
    setInView(null);
    canvasRef.current?.scrollTo?.({ top: 0 });
  }

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
      if (event.key !== "Escape" || event.defaultPrevented || typing(event.target)) return;
      setSelection((current) => stepOut(current));
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="flex h-dvh flex-col bg-surface text-foreground">
      <p className="m-auto max-w-prose p-8 text-center font-body text-base text-foreground lg:hidden">{it.configurator.narrowScreen}</p>

      <div className="hidden min-h-0 flex-1 flex-col lg:flex">
        <span id={SOON_ID} hidden>
          {it.configurator.soon}
        </span>
        <TopBar header={header} back={back} formatId={formatId} onFormat={pickFormat} onSoon={soon} />

        <main
          className="grid min-h-0 flex-1"
          style={{ gridTemplateColumns: `${leftOpen ? "312px" : "0px"} minmax(0,1fr) ${rightOpen ? "224px" : "0px"}`, gridTemplateRows: "minmax(0,1fr)" }}
        >
          {/* Hidden, not unmounted: the theme switch and the panels' own state survive a hide. */}
          <LeftPanel
            hidden={!leftOpen}
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
            />
            <StatusMessage message={message} />
            {!leftOpen && (
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
            {!rightOpen && (
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
            hidden={!rightOpen}
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
