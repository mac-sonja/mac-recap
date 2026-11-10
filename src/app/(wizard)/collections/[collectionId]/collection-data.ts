import * as caseStudy from "@/modules/case-study";
import type { ClientDetail, ClientSector } from "@/modules/case-study";
import type { CollectionDetail, CollectionItem } from "@/modules/collection";
import * as material from "@/modules/material";
import type { RenderAsset } from "@/modules/rendering";
import { log } from "@/shared/log";
import { ok, type Result } from "@/shared/result";
import { boundValuesOf, clientBoundValuesOf, clientRenderAssetsOf, pagesOfDocument, renderAssetsOf } from "@/app/(wizard)/_lib/configurator-data";
import type { CollectionCandidate, CollectionCase, CollectionGroup, PartPages } from "./_components/collection-file";

// Story 5.10a, server only: a collection's groups and pages for its page. Each case is read from
// its live approved revision (`getLiveRevision`, never a working or superseded one) and each
// client's info as it is now: nothing is copied. The caller has authorized `manage collections`.

/** The collection's cases in groups, one per client, in order. */
function groupItems(items: readonly CollectionItem[]): { clientId: string; items: CollectionItem[] }[] {
  const groups: { clientId: string; items: CollectionItem[] }[] = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (last !== undefined && last.clientId === item.case.client.id) last.items.push(item);
    else groups.push({ clientId: item.case.client.id, items: [item] });
  }
  return groups;
}

/** A client's approved intro document as a part, or null (none approved, or not readable: logged). */
async function introOf(client: ClientDetail, sector: string): Promise<PartPages | null> {
  const intro = await caseStudy.getClientIntro(client.id);
  if (!intro.ok) {
    log.warn(`collection intro not read: ${intro.error.code}`, { clientId: client.id });
    return null;
  }
  if (intro.value === null || intro.value.approvedRevisionId === null) return null;
  const live = await caseStudy.getLiveRevision({ kind: "client_intro", id: intro.value.id });
  if (!live.ok) {
    log.warn(`collection intro revision not read: ${live.error.code}`, { clientId: client.id });
    return null;
  }
  if (live.value === null) return null;
  return { template: live.value.doc.template, formats: pagesOfDocument(live.value.doc.formats), values: clientBoundValuesOf(client, sector) };
}

/** A case's pages and render assets from its live revision; null when it can't be drawn (logged): it shows "Non disponibile". */
async function caseOf(item: CollectionItem, client: ClientDetail): Promise<{ part: PartPages; assets: Record<string, RenderAsset> } | null> {
  const revision = item.revision;
  if (revision === null) return null;
  const caseId = item.case.id;
  try {
    const [info, form, listed] = await Promise.all([caseStudy.getClientInfoForCase(caseId), material.getDetailsForm({ caseId }), material.listAssets({ caseId })]);
    if (!info.ok || !form.ok || !listed.ok) {
      log.warn("collection case not read", { caseId });
      return null;
    }
    const assets = await renderAssetsOf(listed.value, (assetId, spec) => material.getRendition(assetId, spec));
    return {
      part: { template: revision.doc.template, formats: pagesOfDocument(revision.doc.formats), values: boundValuesOf(item.case, info.value, client.logoUrl, form.value) },
      assets,
    };
  } catch {
    log.warn("collection case not read: threw", { caseId });
    return null;
  }
}

/**
 * The collection's groups (one per client, each client's cases in order) and every render asset
 * their pages draw: each available case's own files and its client's. A client's approved intro
 * is read when 2 or more of its cases can be drawn (only then does it show). `err` only when a
 * client can't be read.
 */
export async function collectionGroupsOf(
  detail: CollectionDetail,
  sectors: readonly ClientSector[],
): Promise<Result<{ groups: CollectionGroup[]; assets: Record<string, RenderAsset> }>> {
  const assets: Record<string, RenderAsset> = {};
  const grouped = groupItems(detail.items);
  const read = await Promise.all(
    grouped.map(async ({ clientId, items }) => {
      const client = await caseStudy.getClient(clientId);
      if (!client.ok) return client;
      const sector = sectors.find((s) => s.key === client.value.industry)?.label ?? client.value.industry ?? "";
      const cases = await Promise.all(items.map((item) => caseOf(item, client.value)));
      const drawn = cases.filter((c) => c !== null).length;
      const [intro, clientMaterial] = await Promise.all([
        drawn >= 2 ? introOf(client.value, sector) : Promise.resolve(null),
        caseStudy.listClientMaterial({ clientId }),
      ]);
      // A case or the intro may show the client's images and videos; without them their cells stay empty.
      const clientAssets = clientMaterial.ok ? await clientRenderAssetsOf(clientMaterial.value, (assetId, spec) => material.getClientRendition(assetId, spec)) : {};
      Object.assign(assets, clientAssets, ...cases.map((c) => c?.assets ?? {}));
      const group: CollectionGroup = {
        clientId,
        clientName: client.value.name,
        intro,
        cases: items.map((item, i): CollectionCase => ({ caseId: item.case.id, name: item.case.name, code: item.case.code, part: cases[i]?.part ?? null })),
      };
      return ok(group);
    }),
  );
  const groups: CollectionGroup[] = [];
  for (const group of read) {
    if (!group.ok) return group;
    groups.push(group.value);
  }
  return ok({ groups, assets });
}

/**
 * The approved cases **Aggiungi casi** may offer: every approved, non-deleted case not in the
 * collection, newest update first, each with its client's industry (for the tag suggestions). A
 * failed industry read offers them without it (logged).
 */
export async function candidatesOf(detail: CollectionDetail): Promise<Result<CollectionCandidate[]>> {
  const [approved, industries] = await Promise.all([caseStudy.list({ status: "approved" }), caseStudy.listClientIndustries()]);
  if (!approved.ok) return approved;
  if (!industries.ok) log.warn(`collection candidates without industries: ${industries.error.code}`);
  const inside = new Set(detail.items.map((i) => i.case.id.toLowerCase()));
  return ok(
    approved.value
      .filter((c) => c.status === "approved" && !inside.has(c.id.toLowerCase()))
      .map((c) => ({
        id: c.id,
        name: c.name,
        code: c.code,
        clientName: c.client.name,
        clientCode: c.client.code,
        businessLines: c.businessLines,
        industry: industries.ok ? (industries.value[c.client.id] ?? null) : null,
      })),
  );
}
