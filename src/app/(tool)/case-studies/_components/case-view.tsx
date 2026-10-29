"use client";

import { ChevronLeft, Pencil } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { PRIMARY_ACTION } from "@/app/_components/button-styles";
import { DownloadButton } from "@/app/_components/download-button";
import { StatusBadge } from "@/app/_components/status-badge";
import type { ConfiguratorHeader } from "@/app/(wizard)/_components/configurator/top-bar";
import type { Page } from "@/modules/generation";
import { FORMAT_IDS, type BoundValues, type FormatId, type RenderAsset } from "@/modules/rendering";
import { fill, it } from "@/shared/i18n/it";
import { ActivityCard, type ActivityCardLine } from "../../_components/activity-card";
import { CaseViewer } from "./case-viewer";
import { DeleteCaseButton } from "./delete-case-button";

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
  /** The case's id for **Elimina**; `null` for a role that may not `delete case` an approved case, which sees no Elimina. */
  deleteCaseId: string | null;
  /** This case's *Attività*, newest first, with no links; `null` when the log could not be read. */
  activity: readonly ActivityCardLine[] | null;
  /** The server's "now" (ISO): the relative times read the same on the server and after hydration. */
  now: string;
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia?.(REDUCED_MOTION);
  query?.addEventListener?.("change", onChange);
  return () => query?.removeEventListener?.("change", onChange);
}

/** Whether the person asked for reduced motion: the slides then switch without a transition. */
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

/**
 * An approved case's detail page (Story 5.2, part), inside the tool shell and laid out
 * like a client's page: back link; the name, code and badge, with **Scarica** (the picker,
 * still inactive until Story 5.3) and, for a role that may `edit`, **Modifica** to the
 * configurator on the right. Below them the preview (`CaseViewer`), read-only, in a panel of
 * fixed height: every format one slide at a time (← →), with the format switch, zoom and full
 * screen in its toolbar and Instagram's interface over Video. Nothing on it can be selected
 * or edited; below 1024 px a message shows instead. Then **Raccolte**, the collections the
 * case appears in (empty until Story 5.10), **Attività** (this case's event log, as on Home,
 * without links), and bottom left **Elimina** for a role that may delete an approved case.
 */
export function CaseView({
  header,
  back,
  template,
  formats,
  assets,
  values,
  trial,
  editHref,
  deleteCaseId,
  activity,
  now,
}: CaseViewProps) {
  const [formatId, setFormatId] = useState<FormatId>(FORMAT_IDS[0]);
  const [slide, setSlide] = useState(0);
  const still = useReducedMotion();

  const pages = formats[formatId];

  function pickFormat(next: FormatId) {
    if (next === formatId) return;
    setFormatId(next);
    setSlide(0);
  }

  const step = useCallback(
    (delta: -1 | 1) => setSlide((current) => Math.max(0, Math.min(pages.length - 1, current + delta))),
    [pages.length],
  );

  // ← → page every format, in the panel and in full screen.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || typing(event.target)) return;
      // The Scarica and Elimina dialogs own their keys.
      if (event.target instanceof Element && event.target.closest("dialog") !== null) return;
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      // ⌥/⌘/Ctrl + arrow belongs to the browser (back, forward, word jumps).
      if (event.altKey || event.metaKey || event.ctrlKey) return;
      event.preventDefault();
      step(event.key === "ArrowRight" ? 1 : -1);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [step]);

  return (
    <div className="flex flex-col gap-8">
      <Link
        href={back.href}
        className="-ml-1 inline-flex w-fit items-center gap-0.5 rounded-sm font-label text-sm text-foreground-muted transition-colors hover:text-foreground"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        {back.label}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <h1 className="min-w-0 font-heading text-[1.75rem] leading-tight font-semibold tracking-[-0.02em] break-words text-foreground-strong">
              {header.name}
            </h1>
            <StatusBadge status={header.status} className="shrink-0" />
          </div>
          <p className="font-mono text-xs text-foreground-muted">
            <span className="sr-only">{`${it.configurator.codeLabel} `}</span>
            {header.code}
          </p>
        </div>
        <div className="flex items-center gap-2">
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
      </div>

      <p className="font-body text-[15px] text-foreground-muted lg:hidden">{it.caseView.narrowScreen}</p>
      <div className="hidden flex-col lg:flex">
        {/* One slide stays in view: the panel fills the viewport under the header, never less than 560 px. */}
        <CaseViewer
          formatId={formatId}
          onFormat={pickFormat}
          template={template}
          pages={pages}
          assets={assets}
          values={values}
          trial={trial}
          slide={slide}
          onStep={step}
          caption={header.name}
          reducedMotion={still}
        />
      </div>

      <section className="flex flex-col gap-4" aria-labelledby="case-collections-heading">
        <h2 id="case-collections-heading" className="font-heading text-lg font-semibold tracking-[-0.01em] text-foreground-strong">
          {it.caseView.collections.heading}
        </h2>
        <p className="font-body text-[15px] text-foreground-muted">{it.caseView.collections.empty}</p>
      </section>

      <ActivityCard headingId="case-activity-heading" empty={it.caseView.activityEmpty} lines={activity} now={now} />

      {deleteCaseId !== null && (
        <div className="flex justify-start">
          <DeleteCaseButton caseId={deleteCaseId} name={header.name} status="approved" />
        </div>
      )}
    </div>
  );
}
