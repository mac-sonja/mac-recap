import { renderToStaticMarkup } from "react-dom/server";
import { composeParts, renderComposed, type ComposeOptions, type ComposePart } from "@/modules/rendering/compose";
import type { FormatId } from "@/modules/rendering/domain/formats";

/**
 * The self-contained HTML of an export (Story 5.3): the parts drawn by the same renderer
 * as the preview (`renderComposed`, still: no animation, videos as their poster) with
 * `renderToStaticMarkup`, the inline fonts, and a page box of exactly the format's size.
 * Every `section.mr-page` is one PDF page or one PNG; nothing is loaded from elsewhere
 * (its images are `data:` URLs). No script. There is no print route.
 */
export function exportHtml(input: {
  parts: readonly ComposePart[];
  format: FormatId;
  size: { width: number; height: number };
  fontCss: string;
  /** How the parts are composed: a client pack's rule (Story 5.9a) or, left out, the default. */
  compose?: ComposeOptions;
}): string {
  const { width, height } = input.size;
  const body = renderToStaticMarkup(renderComposed(composeParts(input.parts, input.format, input.compose), { still: true }));
  const pageCss = [
    `@page{size:${width}px ${height}px;margin:0}`,
    `html,body{margin:0;padding:0;background:#FFFFFF}`,
    `body{width:${width}px;-webkit-print-color-adjust:exact;print-color-adjust:exact}`,
    // One page per slide: each slide starts a new page, except the very first.
    `section.mr-page{break-before:page;break-inside:avoid}`,
    `body>.mr-root:first-of-type>section.mr-page:first-of-type{break-before:auto}`,
  ].join("\n");
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><style>${input.fontCss}</style><style>${pageCss}</style></head><body>${body}</body></html>`;
}
