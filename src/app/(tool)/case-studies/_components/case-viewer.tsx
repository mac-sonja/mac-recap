"use client";

import { ChevronDown, Maximize, Minimize, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent } from "react";
import { InstagramSwitch, RenderedPage } from "@/app/(wizard)/_components/configurator/canvas";
import { InstagramOverlay, type InstagramView } from "@/app/(wizard)/_components/configurator/instagram-overlay";
import { NAV } from "@/app/(wizard)/_components/configurator/slideshow";
import { ICON_BUTTON, SEG, SEG_BUTTON } from "@/app/(wizard)/_components/configurator/styles";
import { FormatSwitch } from "@/app/(wizard)/_components/configurator/top-bar";
import type { Page } from "@/modules/generation";
import { FORMATS, getFormat, templateOfPage, type BoundValues, type FormatId, type RenderAsset } from "@/modules/rendering";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";

export interface CaseViewerProps {
  formatId: FormatId;
  /** A different format was picked: the page goes back to slide 1 (the viewer returns to Adatta itself). */
  onFormat: (formatId: FormatId) => void;
  template: string;
  /** The format's pages, in order (MAC's own pages among them, drawn with their own renderer). */
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

/** The smallest horizontal drag that pages a slide below 1024 px, in px. */
export const SWIPE_PX = 40;

const noSubscribe = () => () => {};

/** Below Tailwind's `lg` (1024 px): the simplified viewer. */
const NARROW = "(width < 64rem)";

function subscribeNarrow(onChange: () => void) {
  const query = window.matchMedia?.(NARROW);
  query?.addEventListener?.("change", onChange);
  return () => query?.removeEventListener?.("change", onChange);
}

/**
 * Whether the window is narrower than 1024 px. The layout itself follows Tailwind's
 * breakpoints (the server snapshot is wide); this only gates swipe, the slide's inline
 * width and the zoom reset.
 */
const useNarrow = () =>
  useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia?.(NARROW)?.matches === true,
    () => false,
  );

/** Whether this browser can show an element full screen (no button without it). */
const useFullscreenEnabled = () =>
  useSyncExternalStore(
    noSubscribe,
    () => document.fullscreenEnabled === true,
    () => false,
  );

/** A pager button: the slideshow's round ‹ ›, a little smaller under the panel. */
const PAGER = cn(NAV, "size-10 text-[22px]");

/** The format switch as a native dropdown, below 1280 px (styled like the Clienti sort). */
function FormatSelect({ formatId, onFormat }: { formatId: FormatId; onFormat: (formatId: FormatId) => void }) {
  const id = useId();
  return (
    <div className="xl:hidden">
      <label htmlFor={id} className="sr-only">
        {it.configurator.formats.label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={formatId}
          onChange={(event) => onFormat(event.target.value as FormatId)}
          className="h-9 appearance-none rounded-full border border-transparent bg-surface-control pr-8 pl-3.5 font-label text-[13px] text-foreground transition-colors hover:bg-surface-selected"
        >
          {FORMATS.map((format) => (
            <option key={format.id} value={format.id}>
              {`${it.configurator.formats[format.id]} · ${format.ratio}`}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-foreground-muted" />
      </div>
    </div>
  );
}

/**
 * The approved case page's preview (Story 5.2, UX-DR21): every format one slide at a
 * time, drawn read-only by the shared renderer. A toolbar holds the format switch, the
 * Instagram switch on Video, zoom (− / % / +, opening at Adatta) and full screen; the
 * pager (‹ ›, dots, "{i} di {n} · {name}") sits under the slide. A zoomed slide larger
 * than the panel pans by scrolling. Full screen shows only the slide on black, with
 * ‹ › and the counter fading in when the pointer moves. The arrow keys are the page's.
 *
 * Below 1280 px the format switch is a dropdown. Below 1024 px the viewer is simplified:
 * no zoom, the slide fills the panel's width and the panel's height follows it, and a
 * horizontal swipe on the slide pages (left: next, right: previous).
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
  const narrow = useNarrow();
  const swipe = useRef<{ id: number; x: number; y: number } | null>(null);

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
  // Floored: Adatta never spills past the panel by a rounding pixel. Narrow and in the
  // panel, the slide simply takes the panel's width (`max-lg:w-full`, CSS so the first paint is right),
  // capped so a tall slide (9:16 Video) is never taller than the viewport less the toolbar and pager.
  const fluid = narrow && !full;
  const slideWidth = !fluid && fit > 0 ? Math.floor((fit * zoom) / FIT) : undefined;

  // Crossing 1024 px (either way) returns to Adatta: there is no zoom below it.
  const [wasNarrow, setWasNarrow] = useState(narrow);
  if (wasNarrow !== narrow) {
    setWasNarrow(narrow);
    setZoom(FIT);
  }

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

  // Swipe below 1024 px: a mostly horizontal drag of at least SWIPE_PX pages; a vertical one scrolls the page.
  function swipeStart(event: PointerEvent<HTMLElement>) {
    // One finger or the left button only: a second finger (pinch) or another button never pages.
    if (!event.isPrimary || event.button !== 0) return;
    swipe.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    // Released outside the stage, the pointerup still comes here.
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // No capture (test DOMs, a pointer already gone): the gesture still works inside the stage.
    }
  }

  function swipeEnd(event: PointerEvent) {
    const start = swipe.current;
    if (start === null || event.pointerId !== start.id) return;
    swipe.current = null;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) <= Math.abs(dy)) return;
    if (dx < 0 && !atEnd) onStep(1);
    else if (dx > 0 && !atStart) onStep(-1);
  }

  function swipeCancel() {
    swipe.current = null;
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
        full ? "size-full bg-scrim" : "rounded-xl border border-border bg-surface lg:h-[calc(100dvh-16rem)] lg:min-h-[560px]",
        hidden && "cursor-none",
      )}
    >
      {!full && (
        <div data-viewer-toolbar="" className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-2.5">
          <div className="hidden xl:block">
            <FormatSwitch formatId={formatId} onFormat={pickFormat} />
          </div>
          <FormatSelect formatId={formatId} onFormat={pickFormat} />
          <div className="flex items-center gap-3">
            {video && <InstagramSwitch value={instagram} onChange={setInstagram} />}
            {/* No zoom below 1024 px. */}
            <div data-viewer-zoom="" className={cn(SEG, "hidden lg:flex")}>
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

      {/* The stage: the slide centred; zoomed past the panel, it pans by scrolling (auto margins never clip the start).
          Below 1024 px it scrolls nothing itself: vertical drags scroll the page, horizontal ones swipe. */}
      <section
        ref={stage}
        aria-label={it.configurator.canvas.label}
        data-zoom={zoom}
        onPointerDown={narrow ? swipeStart : undefined}
        onPointerUp={narrow ? swipeEnd : undefined}
        onPointerCancel={narrow ? swipeCancel : undefined}
        className={cn(
          "grid min-h-0 flex-1 touch-pan-y lg:touch-auto",
          full ? "overflow-auto p-0" : "p-4 lg:overflow-auto lg:p-6 lg:[scrollbar-gutter:stable_both-edges]",
        )}
      >
        {page === null ? (
          <p className="m-auto font-label text-sm text-foreground-muted">{it.configurator.canvas.empty}</p>
        ) : (
          <div
            key={page.pageKey}
            data-slide={page.pageKey}
            className={cn(
              "relative m-auto shrink-0",
              !full && "shadow-page max-lg:w-full max-lg:max-w-[calc((100dvh-10rem)*var(--slide-ratio))]",
              !reducedMotion && "animate-enter",
            )}
            style={{ ...(full ? {} : { "--slide-ratio": w / h }), ...(slideWidth === undefined ? {} : { width: slideWidth }) } as CSSProperties}
          >
            <div data-canvas-page={page.pageKey}>
              <RenderedPage formatId={formatId} template={templateOfPage(page, template)} page={page} number={index + 1} assets={assets} values={values} animateTexts />
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
