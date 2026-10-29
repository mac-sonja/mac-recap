"use client";

import { Maximize, Minimize, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { InstagramSwitch, RenderedPage } from "@/app/(wizard)/_components/configurator/canvas";
import { InstagramOverlay, type InstagramView } from "@/app/(wizard)/_components/configurator/instagram-overlay";
import { NAV } from "@/app/(wizard)/_components/configurator/slideshow";
import { ICON_BUTTON, SEG, SEG_BUTTON } from "@/app/(wizard)/_components/configurator/styles";
import { FormatSwitch } from "@/app/(wizard)/_components/configurator/top-bar";
import type { Page } from "@/modules/generation";
import { getFormat, type BoundValues, type FormatId, type RenderAsset } from "@/modules/rendering";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";

export interface CaseViewerProps {
  formatId: FormatId;
  /** A different format was picked: the page goes back to slide 1 (the viewer returns to Adatta itself). */
  onFormat: (formatId: FormatId) => void;
  template: string;
  /** The format's pages, in order. */
  pages: readonly Page[];
  assets: Readonly<Record<string, RenderAsset>>;
  values: BoundValues;
  /** The *Bozza di prova* note: no approved revision yet. */
  trial: boolean;
  /** The slide shown, 0-based. */
  slide: number;
  onStep: (delta: -1 | 1) => void;
  /** The Reel's caption: the case name. */
  caption: string;
  /** Reduced motion: slides switch without a fade and the full-screen controls never hide. */
  reducedMotion: boolean;
}

/** The zoom steps, in % of Adatta (the size where the slide fits the panel). */
export const ZOOM_STEPS = [50, 75, 100, 125, 150, 200] as const;
const FIT = 100;

/** The room around the slide in the panel, in px (none in full screen). */
const PAD = 24;

/** How long the pointer stays still before the full-screen controls fade, in ms. */
const IDLE_MS = 2000;

const noSubscribe = () => () => {};

/** Whether this browser can show an element full screen (no button without it). */
const useFullscreenEnabled = () =>
  useSyncExternalStore(
    noSubscribe,
    () => document.fullscreenEnabled === true,
    () => false,
  );

/** A pager button: the slideshow's round ‹ ›, a little smaller under the panel. */
const PAGER = cn(NAV, "size-10 text-[22px]");

/**
 * The approved case page's preview (Story 5.2, UX-DR21): every format one slide at a
 * time, drawn read-only by the shared renderer. A toolbar holds the format switch, the
 * Instagram switch on Video, zoom (− / % / +, opening at Adatta) and full screen; the
 * pager (‹ ›, dots, "{i} di {n} · {name}") sits under the slide. A zoomed slide larger
 * than the panel pans by scrolling. Full screen shows only the slide on black, with
 * ‹ › and the counter fading in when the pointer moves. The arrow keys are the page's.
 */
export function CaseViewer({
  formatId,
  onFormat,
  template,
  pages,
  assets,
  values,
  trial,
  slide,
  onStep,
  caption,
  reducedMotion,
}: CaseViewerProps) {
  const copy = it.caseView.viewer;
  const nav = it.configurator.preview;
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const enterButton = useRef<HTMLButtonElement>(null);
  const exitButton = useRef<HTMLButtonElement>(null);
  const wasFull = useRef(false);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [zoom, setZoom] = useState<number>(FIT);
  const [instagram, setInstagram] = useState<InstagramView>("off");
  const [full, setFull] = useState(false);
  const [awake, setAwake] = useState(true);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const canFull = useFullscreenEnabled();

  const empty = pages.length === 0;
  const index = Math.max(0, Math.min(pages.length - 1, slide));
  const page = empty ? null : pages[index]!;
  const atStart = empty || index <= 0;
  const atEnd = empty || index >= pages.length - 1;
  const zoomAt = ZOOM_STEPS.indexOf(zoom as (typeof ZOOM_STEPS)[number]);
  const minZoom = empty || zoomAt <= 0;
  const maxZoom = empty || zoomAt >= ZOOM_STEPS.length - 1;
  const video = formatId === "video_9_16";

  // Adatta: the widest slide that fits the stage, inside its padding, at the format's aspect.
  const { width: w, height: h } = getFormat(formatId).pixelSize;
  const pad = full ? 0 : PAD;
  const fit = Math.max(0, Math.min(size.width - 2 * pad, (size.height - 2 * pad) * (w / h)));
  // Floored: Adatta never spills past the panel by a rounding pixel.
  const slideWidth = fit > 0 ? Math.floor((fit * zoom) / FIT) : undefined;

  useLayoutEffect(() => {
    const el = stage.current;
    if (el === null) return;
    const measure = () => setSize((was) => (was.width === el.clientWidth && was.height === el.clientHeight ? was : { width: el.clientWidth, height: el.clientHeight }));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [full]);

  // The controls fade after a still moment. Focus inside them moves to the viewer first,
  // since hidden controls are inert; ← → keep working from there.
  const restartIdle = useCallback(() => {
    if (idle.current !== null) clearTimeout(idle.current);
    idle.current = setTimeout(() => {
      idle.current = null;
      if (controls.current?.contains(document.activeElement)) root.current?.focus({ preventScroll: true });
      setAwake(false);
    }, IDLE_MS);
  }, []);

  function wake() {
    setAwake(true);
    restartIdle();
  }

  // A new slide in full screen (‹ ›, or the page's ← →) shows the controls again.
  const [shownIndex, setShownIndex] = useState(index);
  if (shownIndex !== index) {
    setShownIndex(index);
    if (full) setAwake(true);
  }
  useEffect(() => {
    if (full) restartIdle();
  }, [full, index, restartIdle]);

  // Entering or leaving full screen (the button, Esc or the browser's own exit) returns to
  // Adatta, with the controls showing.
  useEffect(() => {
    function onChange() {
      setFull(root.current !== null && document.fullscreenElement === root.current);
      setZoom(FIT);
      setAwake(true);
      if (idle.current !== null) clearTimeout(idle.current);
      idle.current = null;
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      if (idle.current !== null) clearTimeout(idle.current);
    };
  }, []);

  // The button that was pressed goes away: focus the exit button entering, Schermo intero leaving.
  useEffect(() => {
    if (full === wasFull.current) return;
    wasFull.current = full;
    (full ? exitButton : enterButton).current?.focus();
  }, [full]);

  // A new slide or zoom starts at the top left, not at the previous scroll offset.
  const pageKey = page?.pageKey;
  useEffect(() => {
    stage.current?.scrollTo?.({ top: 0, left: 0 });
  }, [pageKey, zoom]);

  function pickFormat(next: FormatId) {
    if (next === formatId) return;
    setZoom(FIT);
    onFormat(next);
  }

  function stepZoom(delta: -1 | 1) {
    const next = ZOOM_STEPS[zoomAt + delta];
    if (next !== undefined) setZoom(next);
  }

  function toggleFullscreen() {
    if (full) void document.exitFullscreen?.()?.catch?.(() => {});
    else void root.current?.requestFullscreen?.()?.catch?.(() => {});
  }

  const prev = (
    <button
      type="button"
      aria-label={nav.previous}
      aria-keyshortcuts="ArrowLeft"
      aria-disabled={atStart}
      onClick={() => !atStart && onStep(-1)}
      className={full ? NAV : PAGER}
    >
      <span aria-hidden="true">‹</span>
    </button>
  );
  const next = (
    <button
      type="button"
      aria-label={nav.next}
      aria-keyshortcuts="ArrowRight"
      aria-disabled={atEnd}
      onClick={() => !atEnd && onStep(1)}
      className={full ? NAV : PAGER}
    >
      <span aria-hidden="true">›</span>
    </button>
  );
  const counter = page === null ? "" : fill(nav.slide, { i: index + 1, n: pages.length, name: page.name });
  const hidden = full && !awake && !reducedMotion;

  return (
    <div
      ref={root}
      tabIndex={-1}
      data-viewer=""
      data-fullscreen={full ? "" : undefined}
      onMouseMove={full ? wake : undefined}
      className={cn(
        "relative flex flex-col overflow-hidden focus-visible:outline-none",
        full ? "size-full bg-scrim" : "h-[calc(100dvh-16rem)] min-h-[560px] rounded-xl border border-border bg-surface",
        hidden && "cursor-none",
      )}
    >
      {!full && (
        <div data-viewer-toolbar="" className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-2.5">
          <FormatSwitch formatId={formatId} onFormat={pickFormat} />
          <div className="flex items-center gap-3">
            {video && <InstagramSwitch value={instagram} onChange={setInstagram} />}
            <div className={SEG}>
              <button type="button" aria-label={copy.zoomOut} title={copy.zoomOut} aria-disabled={minZoom} onClick={() => !minZoom && stepZoom(-1)} className={cn(SEG_BUTTON, "px-2")}>
                <Minus aria-hidden="true" className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label={fill(copy.zoomReset, { n: zoom })}
                title={copy.fit}
                aria-disabled={empty}
                onClick={() => !empty && setZoom(FIT)}
                className={cn(SEG_BUTTON, "min-w-14 px-2 tabular-nums")}
              >
                {fill(copy.zoom, { n: zoom })}
              </button>
              <button type="button" aria-label={copy.zoomIn} title={copy.zoomIn} aria-disabled={maxZoom} onClick={() => !maxZoom && stepZoom(1)} className={cn(SEG_BUTTON, "px-2")}>
                <Plus aria-hidden="true" className="size-3.5" />
              </button>
            </div>
            {canFull && (
              <button
                ref={enterButton}
                type="button"
                aria-label={copy.fullscreen}
                title={copy.fullscreen}
                aria-disabled={empty}
                onClick={() => !empty && toggleFullscreen()}
                className={cn(ICON_BUTTON, "size-8 bg-surface-raised text-foreground shadow-control")}
              >
                <Maximize aria-hidden="true" className="size-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {trial && !full && (
        <p className="mx-3 mt-3 shrink-0 rounded-lg bg-surface-raised px-4 py-3 font-label text-[13px] text-foreground shadow-card">
          <b className="mr-1.5 font-semibold text-foreground-strong">{it.configurator.trial.title}</b>
          {it.configurator.trial.body}
        </p>
      )}

      {/* The stage: the slide centred; zoomed past the panel, it pans by scrolling (auto margins never clip the start). */}
      <section
        ref={stage}
        aria-label={it.configurator.canvas.label}
        data-zoom={zoom}
        className={cn("grid min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable_both-edges]", full ? "p-0" : "p-6")}
      >
        {page === null ? (
          <p className="m-auto font-label text-sm text-foreground-muted">{it.configurator.canvas.empty}</p>
        ) : (
          <div
            key={page.pageKey}
            data-slide={page.pageKey}
            className={cn("relative m-auto shrink-0", !full && "shadow-page", !reducedMotion && "animate-enter")}
            style={slideWidth === undefined ? undefined : { width: slideWidth }}
          >
            <div data-canvas-page={page.pageKey}>
              <RenderedPage formatId={formatId} template={template} page={page} number={index + 1} assets={assets} values={values} animateTexts />
            </div>
            {video && instagram !== "off" && <InstagramOverlay view={instagram} caption={caption} />}
          </div>
        )}
      </section>

      {full ? (
        <div
          ref={controls}
          data-viewer-controls=""
          data-hidden={hidden ? "" : undefined}
          inert={hidden}
          onFocus={wake}
          className={cn("pointer-events-none absolute inset-0", !reducedMotion && "transition-opacity duration-300 ease-out", hidden && "opacity-0")}
        >
          <div className="pointer-events-auto absolute top-1/2 left-6 -translate-y-1/2">{prev}</div>
          <div className="pointer-events-auto absolute top-1/2 right-6 -translate-y-1/2">{next}</div>
          <button
            ref={exitButton}
            type="button"
            aria-label={copy.exitFullscreen}
            title={copy.exitFullscreen}
            onClick={toggleFullscreen}
            className={cn(ICON_BUTTON, "pointer-events-auto absolute top-5 right-5 size-10 bg-surface-inverse text-surface-inverse-foreground hover:bg-surface-inverse hover:text-surface-inverse-foreground")}
          >
            <Minimize aria-hidden="true" className="size-4" />
          </button>
          <p
            aria-live="polite"
            className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-surface-inverse px-3.5 py-1.5 font-label text-[12.5px] whitespace-nowrap text-surface-inverse-foreground"
          >
            {counter}
          </p>
        </div>
      ) : (
        <div data-pager="" className="flex shrink-0 items-center justify-center gap-4 border-t border-border px-3 py-2.5">
          {prev}
          <div className="flex min-w-0 flex-col items-center gap-1.5">
            <div aria-hidden="true" className="flex gap-1.5">
              {pages.map((p, i) => (
                <i key={p.pageKey} data-on={i === index ? "" : undefined} className="size-[7px] rounded-full bg-border-strong data-on:bg-accent" />
              ))}
            </div>
            <p aria-live="polite" className="min-h-[1lh] truncate font-label text-[12.5px] text-foreground-muted">
              {counter}
            </p>
          </div>
          {next}
        </div>
      )}
    </div>
  );
}
