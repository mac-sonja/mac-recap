import { redirect } from "next/navigation";
import { collectionsHref } from "@/app/_lib/routes";
import { requireSurface } from "@/app/_lib/surface";
import * as caseStudy from "@/modules/case-study";
import * as collection from "@/modules/collection";
import { addCollectionItems, moveCollectionGroup, moveCollectionItem, removeCollectionItems, retagCollection } from "./actions";
import { candidatesOf, collectionGroupsOf } from "./collection-data";
import { CollectionView, type CollectionActions } from "./_components/collection-view";

export interface CollectionPageProps {
  params: Promise<{ collectionId: string }>;
}

/** The page's server actions, typed as the view calls them. */
const ACTIONS: CollectionActions = {
  moveGroup: moveCollectionGroup,
  moveItem: moveCollectionItem,
  addItems: addCollectionItems,
  removeItems: removeCollectionItems,
  retag: retagCollection,
};

/**
 * One collection (Story 5.10a), full screen in the configurator's file view, every page
 * read-only for now: for every role (`manage collections`; owner 2026-11-10: admin included).
 * Each case shows its live approved revision and its client's current info, never a copy; a case
 * with no approved revision any more is "Non disponibile". An unknown, malformed or deleted
 * collection goes back to Raccolte; any other load failure throws into the wizard group's error
 * boundary. Remounted on every new version, so a change read again (an added or removed case)
 * starts the view afresh.
 */
export default async function CollectionPage({ params }: CollectionPageProps) {
  const shell = await requireSurface("manage collections");
  if (shell === null) return null;

  const { collectionId } = await params;
  const found = await collection.getCollection(collectionId);
  if (!found.ok) {
    if (found.error.code === "COLLECTION_NOT_FOUND") redirect(collectionsHref());
    throw new Error(`Collection could not be loaded: ${found.error.code}`);
  }
  const detail = found.value;
  const sectors = await caseStudy.listClientSectors();
  const sectorList = sectors.ok ? sectors.value : [];
  const [drawn, candidates] = await Promise.all([collectionGroupsOf(detail, sectorList), candidatesOf(detail)]);
  if (!drawn.ok) throw new Error(`Collection cases could not be loaded: ${drawn.error.code}`);
  if (!candidates.ok) throw new Error(`Approved cases could not be listed: ${candidates.error.code}`);

  return (
    <CollectionView
      key={`${detail.id}:${detail.version}`}
      id={detail.id}
      name={detail.name}
      version={detail.version}
      tags={{ businessLines: caseStudy.BUSINESS_LINES.filter((line) => detail.tags.businessLines.includes(line)), industries: detail.tags.industries }}
      groups={drawn.value.groups}
      assets={drawn.value.assets}
      candidates={candidates.value}
      tagOptions={{ businessLines: caseStudy.BUSINESS_LINES, sectors: sectorList }}
      actions={ACTIONS}
    />
  );
}
