"use client";

import { Pencil } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PRIMARY_ACTION } from "@/app/_components/button-styles";
import { DownloadButton } from "@/app/_components/download-button";
import type { Page } from "@/modules/generation";
import { FORMAT_IDS, type BoundValues, type FormatId, type RenderAsset } from "@/modules/rendering";
import { fill, it } from "@/shared/i18n/it";
import { Canvas } from "../configurator/canvas";
import type { InstagramView } from "../configurator/instagram-overlay";
import { DocumentHeading, FormatSwitch, type ConfiguratorHeader } from "../configurator/top-bar";

export interface CaseViewProps {
  /** Name, code and status (always Approvato here). */
  header: ConfiguratorHeader;
  back: { href: string; label: string };
  /** The live revision's template ref (`mac-case@1`). */
  template: string;
  /** Each registry format's own pages, in order. */
  formats: Readonly<Record<FormatId, readonly Page[]>>;
  /** By asset id; an asset left out (rendition not ready) draws an empty cell. */
  assets: Readonly<Record<string, RenderAsset>>;
  values: BoundValues;
  /** No approved revision yet: the starter pages, with the *Bozza di prova* note. */
  trial: boolean;
  /** Where **Modifica** goes (the configurator); `null` for a role without `edit`, which sees no Modifica. */
  editHref: string | null;
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia?.(REDUCED_MOTION);
  query?.addEventListener?.("change", onChange);
  return () => query?.removeEventListener?.("change", onChange);
}

/** Whether the person asked for reduced motion: the slideshow then switches without a transition. */
const useReducedMotion = () =>
  useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia?.(REDUCED_MOTION).matches === true,
    () => false,
  );

/** A key press that belongs to a field being typed in, not to the slideshow. */
const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || target.closest('input:not([type="checkbox"], [type="radio"]), textarea, select') !== null);

const ignore = () => {};

/**
 * An approved case's detail page (Story 5.2, part): full screen, no sidebar, read-only.
 * The top bar has back, name, code and badge, the format switch, **Scarica** (the picker,
 * still inactive until Story 5.3) and, for a role that may `edit`, **Modifica** to the
 * configurator. Below it the configurator's Anteprima canvas: Presentazione stacked,
 * Carosello and Video as a slideshow (← →), with Instagram's interface over Video.
 * Nothing on the page can be selected or edited. Below 1024 px only a message shows.
 */
export function CaseView({ header, back, template, formats, assets, values, trial, editHref }: CaseViewProps) {
  const [formatId, setFormatId] = useState<FormatId>(FORMAT_IDS[0]);
  const [slide, setSlide] = useState(0);
  const [instagram, setInstagram] = useState<InstagramView>("off");
  const still = useReducedMotion();
  const canvasRef = useRef<HTMLElement>(null);

  const pages = formats[formatId];
  const slideshow = formatId !== "presentazione_16_9";

  function pickFormat(next: FormatId) {
    if (next === formatId) return;
    setFormatId(next);
    setSlide(0);
    canvasRef.current?.scrollTo?.({ top: 0 });
  }

  const step = useCallback(
    (delta: -1 | 1) => setSlide((current) => Math.max(0, Math.min(pages.length - 1, current + delta))),
    [pages.length],
  );

  useEffect(() => {
    if (!slideshow) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || typing(event.target)) return;
      // The Scarica dialog's radios own their arrows.
      if (event.target instanceof Element && event.target.closest("dialog") !== null) return;
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      // ⌥/⌘/Ctrl + arrow belongs to the browser (back, forward, word jumps).
      if (event.altKey || event.metaKey || event.ctrlKey) return;
      event.preventDefault();
      step(event.key === "ArrowRight" ? 1 : -1);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [slideshow, step]);

  return (
    <div className="flex h-dvh flex-col bg-surface text-foreground">
      <p className="m-auto max-w-prose p-8 text-center font-body text-base text-foreground lg:hidden">{it.caseView.narrowScreen}</p>

      <div className="hidden min-h-0 flex-1 flex-col lg:flex">
        <header className="grid h-14 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 border-b border-border bg-surface-sidebar px-3">
          <DocumentHeading header={header} back={back} />
          <FormatSwitch formatId={formatId} onFormat={pickFormat} />
          <div className="flex min-w-0 items-center justify-end gap-2">
            <DownloadButton
              label={fill(it.download.caseLabel, { name: header.name })}
              title={fill(it.download.caseTitle, { name: header.name })}
              description={it.download.caseDescription}
            />
            {editHref !== null && (
              <Link href={editHref} className={PRIMARY_ACTION}>
                <Pencil aria-hidden="true" className="size-4" />
                {it.caseView.edit}
              </Link>
            )}
          </div>
        </header>

        <main className="relative min-h-0 flex-1">
          <Canvas
            formatId={formatId}
            template={template}
            pages={pages}
            assets={assets}
            values={values}
            selection={null}
            onSelect={ignore}
            onPageInView={ignore}
            trial={trial}
            scrollRef={canvasRef}
            preview
            slide={slide}
            onStep={step}
            instagram={instagram}
            onInstagram={setInstagram}
            caption={header.name}
            animateTexts
            onAnimateTexts={ignore}
            reducedMotion={still}
          />
        </main>
      </div>
    </div>
  );
}
