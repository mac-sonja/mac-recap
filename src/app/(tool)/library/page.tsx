import { FolderOpen } from "lucide-react";
import Link from "next/link";
import { SECONDARY_ACTION } from "@/app/_components/button-styles";
import { CARD } from "@/app/_components/field-styles";
import { PageHeader } from "@/app/_components/page-header";
import { requireSurface } from "@/app/_lib/surface";
import { boundValuesOf, pagesOfDocument, renderAssetsOf } from "@/app/(wizard)/_lib/configurator-data";
import { can } from "@/modules/access";
import * as caseStudy from "@/modules/case-study";
import { referencedAssetIds, type ListedCaseStudy, type ListScope } from "@/modules/case-study";
import * as material from "@/modules/material";
import { fill, it } from "@/shared/i18n/it";
import { log } from "@/shared/log";
import { cn } from "@/shared/utils";
import { CaseViewsToggle } from "../case-studies/_components/case-views-toggle";
import type { LibraryCardProps, LibraryCover } from "./_components/library-card";
import { LibraryFilters } from "./_components/library-filters";
import { LibraryGrid } from "./_components/library-grid";
import {
  facetOptions,
  filterCases,
  paginate,
  parseLibraryState,
  sortByApproval,
  withKnownFacets,
  type LibraryCase,
  type SearchParams,
} from "./_lib/library-data";

/** The library lists approved cases only, for every role: the `list cases` scope it asks for. */
const APPROVED: ListScope = { status: "approved" };

/** A client's logo link, read once per client per request (several cards share a client). */
type LogoOf = (clientId: string) => Promise<string | null>;

/**
 * A card's cover: page 1 of Presentazione 16:9 in the case's live (approved) revision, never
 * a working or superseded one. Signs renditions only for the assets that page uses; one not
 * ready leaves an empty cell. `null` (a neutral placeholder) when the revision has no
 * Presentazione page; a cover that can't be read is logged and shows the placeholder too, so
 * one case never takes the library down.
 */
async function coverOf(c: ListedCaseStudy, logoOf: LogoOf): Promise<LibraryCover | null> {
  try {
    const revision = await caseStudy.getLiveRevision({ kind: "case", id: c.id });
    if (!revision.ok) throw new Error(revision.error.code);
    const doc = revision.value?.doc;
    if (doc === undefined) return null;
    const page = pagesOfDocument(doc.formats).presentazione_16_9[0];
    if (page === undefined) return null;

    const used = referencedAssetIds(page);
    const [info, form, listed] = await Promise.all([
      caseStudy.getClientInfoForCase(c.id),
      material.getDetailsForm({ caseId: c.id }),
      used.size === 0 ? Promise.resolve({ ok: true as const, value: [] }) : material.listAssets({ caseId: c.id }),
    ]);
    if (!info.ok) throw new Error(info.error.code);
    if (!form.ok) throw new Error(form.error.code);
    if (!listed.ok) throw new Error(listed.error.code);
    const [logoUrl, assets] = await Promise.all([
      logoOf(info.value.clientId),
      renderAssetsOf(
        listed.value.filter((asset) => used.has(asset.id.toLowerCase())),
        (assetId, spec) => material.getRendition(assetId, spec),
      ),
    ]);
    return { template: doc.template, page, assets, values: boundValuesOf(c, info.value, logoUrl, form.value) };
  } catch (error) {
    log.warn(`library cover could not be read: ${error instanceof Error ? error.message : "unknown"}`, { caseId: c.id });
    return null;
  }
}

const toLibraryCase = (c: ListedCaseStudy): LibraryCase => ({
  id: c.id,
  code: c.code,
  name: c.name,
  clientName: c.client.name,
  clientCode: c.client.code,
  year: c.year,
  businessLines: c.businessLines,
  approvedAt: c.approvedAt,
  updatedAt: c.updatedAt,
});

/**
 * The library of approved cases (Story 5.1): the account/sales/social landing, and the
 * owner/designer's **Libreria** view (with the Tabella / Libreria switch). A role that may not
 * list approved cases goes to its landing. Lists the approved cases only (the `list cases`
 * scope `{ status: "approved" }`), newest approval first, as cards of 24 per page. Search
 * (the table's rules), the Cliente and Anno facets and the page come from the address and
 * are applied here; only the cards shown read their covers (`getLiveRevision`). A failed list
 * throws into the error boundary.
 */
export default async function LibraryPage({ searchParams }: { searchParams?: Promise<SearchParams> } = {}) {
  const shell = await requireSurface("list cases", APPROVED);
  if (shell === null) return null;
  const { actor } = shell;

  const listed = await caseStudy.list(APPROVED);
  if (!listed.ok) throw new Error(`Approved case studies could not be listed: ${listed.error.code}`);
  // Approved only, whatever the list returns; newest approval first.
  const approved = sortByApproval(listed.value.filter((c) => c.status === "approved"));
  const cases = approved.map(toLibraryCase);

  const options = facetOptions(cases);
  const state = withKnownFacets(parseLibraryState(await searchParams), options);
  const matching = new Set(filterCases(cases, state).map((c) => c.id));
  const shown = paginate(
    approved.filter((c) => matching.has(c.id)),
    state.page,
  );

  const logos = new Map<string, Promise<string | null>>();
  const logoOf: LogoOf = (clientId) => {
    let logo = logos.get(clientId);
    if (logo === undefined) {
      logo = caseStudy.getClient(clientId).then((client) => {
        if (!client.ok) throw new Error(client.error.code);
        return client.value.logoUrl;
      });
      logos.set(clientId, logo);
    }
    return logo;
  };
  const cards: LibraryCardProps[] = await Promise.all(
    shown.items.map(async (c) => ({ id: c.id, name: c.name, clientName: c.client.name, year: c.year, cover: await coverOf(c, logoOf) })),
  );

  const toggle = can(actor, "list cases", {}) ? <CaseViewsToggle current="library" /> : undefined;
  const query = state.q.trim();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={it.library.title} lead={it.library.lead} action={toggle} />
      {cases.length === 0 ? (
        <div className={cn(CARD, "flex flex-col items-center gap-4 px-8 py-14 text-center")}>
          <span className="flex size-11 items-center justify-center rounded-full bg-surface-control text-foreground-muted">
            <FolderOpen aria-hidden="true" className="size-5" strokeWidth={1.75} />
          </span>
          <p className="max-w-sm font-body text-[15px] leading-snug text-foreground-muted">{it.library.empty}</p>
        </div>
      ) : (
        <LibraryFilters state={{ ...state, page: shown.page }} options={options}>
          <div className="flex flex-col gap-4">
            <p role="status" className={cn("font-body text-[15px] text-foreground", shown.total > 0 && "sr-only")}>
              {shown.total > 0
                ? fill(it.library.count, { n: shown.total })
                : query !== ""
                  ? fill(it.library.noResults, { query })
                  : it.library.noResultsFilters}
            </p>
            {shown.total === 0 ? (
              <div className="flex flex-col items-start">
                <Link href="/library" className={SECONDARY_ACTION}>
                  {it.library.clearSearch}
                </Link>
              </div>
            ) : (
              <LibraryGrid cards={cards} state={state} page={shown.page} pageCount={shown.pageCount} />
            )}
          </div>
        </LibraryFilters>
      )}
    </div>
  );
}
