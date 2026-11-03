"use client";

import { memo, useLayoutEffect, useRef } from "react";
import type { Page } from "@/modules/generation";
import { FORMAT_IDS, measureOverflow, renderFormat, type BoundValues, type FormatId, type RenderAsset } from "@/modules/rendering";

/** Each format's first overflowing page (1-based), or null when nothing overflows. */
export type OverflowByFormat = Readonly<Record<FormatId, number | null>>;

/** The width each format is measured at (the editor's page widths; pages scale with it). */
const MEASURE_WIDTH: Readonly<Record<FormatId, number>> = {
  presentazione_16_9: 1280,
  carosello_1_1: 540,
  video_9_16: 420,
};

const sameReport = (a: OverflowByFormat | null, b: OverflowByFormat) => a !== null && FORMAT_IDS.every((id) => a[id] === b[id]);

/** One format's pages, still (no text loop, videos on their poster): what overflow is measured on. */
const StillFormat = memo(function StillFormat({
  formatId,
  template,
  pages,
  assets,
  values,
}: {
  formatId: FormatId;
  template: string;
  pages: readonly Page[];
  assets: Readonly<Record<string, RenderAsset>>;
  values: BoundValues;
}) {
  return renderFormat(template, formatId, { pages, assets, values, options: { still: true } });
});

/**
 * Overflow of every format (Story 4.8): each format's pages drawn off screen by the shared
 * renderer (inert, hidden from assistive tech) and measured with `measureOverflow` after
 * layout, again when the pages change, when web fonts arrive and when the size changes.
 * Reports each format's first overflowing page, so **Approva** can say what's left.
 */
export function OverflowReport({
  template,
  formats,
  assets,
  values,
  onReport,
}: {
  template: string;
  formats: Readonly<Record<FormatId, readonly Page[]>>;
  assets: Readonly<Record<string, RenderAsset>>;
  values: BoundValues;
  onReport: (report: OverflowByFormat) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const last = useRef<OverflowByFormat | null>(null);
  const report = useRef(onReport);
  useLayoutEffect(() => {
    report.current = onReport;
  });

  useLayoutEffect(() => {
    const el = host.current;
    if (el === null) return;
    const measure = () => {
      const next = Object.fromEntries(
        FORMAT_IDS.map((id) => {
          const root = el.querySelector(`[data-measure-format="${id}"]`);
          const pages = root === null ? [] : measureOverflow(root).pages;
          const at = pages.findIndex((page) => page.overflow);
          return [id, at < 0 ? null : at + 1];
        }),
      ) as OverflowByFormat;
      if (sameReport(last.current, next)) return;
      last.current = next;
      report.current(next);
    };
    measure();
    let live = true;
    void document.fonts?.ready.then(() => {
      if (live) measure();
    });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(el);
    return () => {
      live = false;
      observer?.disconnect();
    };
  }, [formats, assets, values, template]);

  return (
    <div ref={host} aria-hidden="true" inert data-overflow-report className="pointer-events-none invisible fixed top-0 left-[-100000px]">
      {FORMAT_IDS.map((id) => (
        <div key={id} data-measure-format={id} style={{ width: MEASURE_WIDTH[id] }}>
          <StillFormat formatId={id} template={template} pages={formats[id] ?? []} assets={assets} values={values} />
        </div>
      ))}
    </div>
  );
}
