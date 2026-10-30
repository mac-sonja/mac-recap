import { randomUUID } from "node:crypto";
import { referencedAssetIds, type CaseClientInfo, type CaseStudy } from "@/modules/case-study";
import type { Page } from "@/modules/generation";
import type { DetailsForm, ListedAsset, RenditionLink } from "@/modules/material";
import { CASE_TEMPLATE, FORMAT_IDS, starterPages, type BoundValues, type FormatId, type RenderAsset, type TemplateContext } from "@/modules/rendering";
import { it } from "@/shared/i18n/it";
import type { Result } from "@/shared/result";

/** Each registry format's pages, in order (`[]` for a format the document lacks). */
export type FormatPagesById = Readonly<Record<FormatId, readonly Page[]>>;

/**
 * The current values the pages bind to (Story 3.5's `BoundValues`), from the case's
 * client info, the client's logo, the case itself and its details form. Read per
 * request, never stored in the document.
 */
export function boundValuesOf(caseStudy: CaseStudy, info: CaseClientInfo, logoUrl: string | null, form: DetailsForm): BoundValues {
  const { brief } = info;
  return {
    client: {
      name: info.name,
      sector: info.industry?.label ?? "",
      description: info.description ?? "",
      logoUrl,
      results: brief.results,
      testimonial: brief.testimonialQuote === "" ? null : { quote: brief.testimonialQuote, author: brief.testimonialAuthor },
    },
    case: {
      year: caseStudy.year,
      services: caseStudy.businessLines.map((line) => it.businessLines[line]),
      results: form.results,
      testimonial: form.testimonialQuote === "" ? null : { quote: form.testimonialQuote, author: form.testimonialAuthor },
    },
  };
}

/** A revision document's pages per registry format. */
export function pagesOfDocument(formats: Readonly<Record<string, { pages: readonly Page[] } | undefined>>): FormatPagesById {
  return Object.fromEntries(
    FORMAT_IDS.map((id) => [id, Object.hasOwn(formats, id) ? (formats[id]?.pages ?? []) : []]),
  ) as unknown as FormatPagesById;
}

/**
 * A case with no revision yet (owner, 2026-10-28): the template's starter pages of
 * each format, built from the case's images (oldest first) and its result rows and
 * testimonial, with empty texts. Nothing is saved.
 */
export function starterPagesOf(assets: readonly ListedAsset[], form: DetailsForm, newId: () => string = randomUUID): FormatPagesById {
  const ctx: TemplateContext = {
    newId,
    texts: {},
    images: assets.filter((a) => a.kind === "image").map((a) => a.id),
    resultRows: form.results.length,
    hasTestimonial: form.testimonialQuote !== "",
  };
  return Object.fromEntries(FORMAT_IDS.map((id) => [id, starterPages(CASE_TEMPLATE, "case_history", id, ctx)])) as unknown as FormatPagesById;
}

/**
 * The case's images (oldest first) that `docs` already reference: what Pagine di default
 * may place (Story 4.4c). `saveRevisionDoc` refuses any other asset until Story 4.5's
 * media guardrail.
 */
export function imagePoolOf(assets: readonly ListedAsset[], docs: readonly unknown[]): string[] {
  const used = new Set(docs.flatMap((doc) => [...referencedAssetIds(doc)]));
  return assets.filter((a) => a.kind === "image" && used.has(a.id.toLowerCase())).map((a) => a.id);
}

type GetRendition = (assetId: string, specName: string) => Promise<Result<RenditionLink>>;

/** Renditions that may be missing without failing the page: not made yet, or the asset just went. */
const SKIPPABLE = new Set(["RENDITION_NOT_READY", "NOT_FOUND"]);

/**
 * The render assets of a case's images and videos: an image's `image.display`, a
 * video's `video.display` with its `video.poster`. A rendition that isn't ready leaves
 * its asset out (an empty cell; a video without its poster keeps no poster). Any other
 * failure throws into the error boundary.
 */
export async function renderAssetsOf(assets: readonly ListedAsset[], getRendition: GetRendition): Promise<Record<string, RenderAsset>> {
  const read = async (assetId: string, spec: string): Promise<string | null> => {
    const link = await getRendition(assetId, spec);
    if (link.ok) return link.value.url;
    if (SKIPPABLE.has(link.error.code)) return null;
    throw new Error(`Rendition could not be loaded: ${link.error.code}`);
  };
  const entries = await Promise.all(
    assets.map(async (asset): Promise<[string, RenderAsset] | null> => {
      if (asset.kind === "image") {
        const url = await read(asset.id, "image.display");
        return url === null ? null : [asset.id, { url, kind: "image" }];
      }
      if (asset.kind === "video") {
        const [url, posterUrl] = await Promise.all([read(asset.id, "video.display"), read(asset.id, "video.poster")]);
        if (url === null) return null;
        return [asset.id, posterUrl === null ? { url, kind: "video" } : { url, kind: "video", posterUrl }];
      }
      return null;
    }),
  );
  return Object.fromEntries(entries.filter((entry) => entry !== null));
}
