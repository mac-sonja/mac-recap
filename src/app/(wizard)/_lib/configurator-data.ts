import { randomUUID } from "node:crypto";
import { referencedAssetIds, type CaseClientInfo, type CaseStudy, type ClientDetail, type ListedClientAsset } from "@/modules/case-study";
import type { Page } from "@/modules/generation";
import type { DetailsForm, ListedAsset, RenditionLink } from "@/modules/material";
import { CASE_TEMPLATE, FORMAT_IDS, starterPages, type BoundValues, type FormatId, type RenderAsset, type TemplateContext } from "@/modules/rendering";
import { it } from "@/shared/i18n/it";
import { log } from "@/shared/log";
import type { ClientEditableFields, EditableFields } from "../_components/configurator/bound-fields";
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

/**
 * The stored values the configurator's field edits start from (Story 4.3d): every field
 * `updateClient` needs, and the case's year, services, results and testimonial. Each save
 * sends the whole input built from these plus one change, so it never drops another field.
 */
export function editableFieldsOf(caseStudy: CaseStudy, info: CaseClientInfo, form: DetailsForm): EditableFields {
  return {
    client: {
      id: info.clientId,
      name: info.name,
      industry: info.industry?.key ?? null,
      description: info.description ?? "",
      logoId: info.logoId,
    },
    case: {
      year: caseStudy.year,
      businessLines: [...caseStudy.businessLines],
      results: form.results.map((row) => ({ label: row.label, value: row.value })),
      testimonial: { quote: form.testimonialQuote, author: form.testimonialAuthor },
    },
  };
}

/**
 * Client mode (Story 4.11a): the values a client's intro and outro bind to, from the client
 * itself (`sector` its sector's label) and its brief's result rows and testimonial. A client
 * page binds no case, so the case's values are empty.
 */
export function clientBoundValuesOf(client: ClientDetail, sector: string): BoundValues {
  const { brief } = client;
  return {
    client: {
      name: client.name,
      sector,
      description: client.description ?? "",
      logoUrl: client.logoUrl,
      results: brief.results,
      testimonial: brief.testimonialQuote === "" ? null : { quote: brief.testimonialQuote, author: brief.testimonialAuthor },
    },
    case: { year: null, services: [], results: [], testimonial: null },
  };
}

/** Client mode (Story 4.11a): the client's stored fields its field edits start from, its own result rows and testimonial included. */
export function clientEditableFieldsOf(client: ClientDetail): ClientEditableFields {
  return {
    client: { id: client.id, name: client.name, industry: client.industry, description: client.description ?? "", logoId: client.logoId },
    record: {
      results: client.brief.results.map((row) => ({ label: row.label, value: row.value })),
      testimonial: { quote: client.brief.testimonialQuote, author: client.brief.testimonialAuthor },
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
 * may place (Story 4.4c).
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
export async function renderAssetsOf(
  assets: readonly Pick<ListedAsset, "id" | "kind">[],
  getRendition: GetRendition,
): Promise<Record<string, RenderAsset>> {
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

// Story 4.11a: `clientMediaOf` lives with the Media tab's helpers, so the tab can map a fresh client listing too.
export { clientMediaOf } from "../_components/configurator/media-files";

/** A client's images and videos (Story 4.5c-2): the only client files a page shows. */
export const clientMediaFiles = <F extends Pick<ListedClientAsset, "kind">>(files: readonly F[]): F[] =>
  files.filter((file) => file.kind === "image" || file.kind === "video");

/**
 * The render assets of a client's images and videos (Story 4.5c-2), from the client
 * renditions, one file at a time: a file whose rendition can't be read is left out (logged
 * with its ids only) and never drops the others.
 */
export async function clientRenderAssetsOf(
  files: readonly Pick<ListedClientAsset, "id" | "kind" | "clientId">[],
  getClientRendition: GetRendition,
): Promise<Record<string, RenderAsset>> {
  const each = await Promise.all(
    clientMediaFiles(files).map((file) =>
      renderAssetsOf([file], getClientRendition).catch(() => {
        log.warn("client rendition not read", { clientId: file.clientId });
        return {};
      }),
    ),
  );
  return Object.assign({}, ...each) as Record<string, RenderAsset>;
}
