import type { Role } from "@/modules/access";

// The expected outcome of every server action for every role (Stories 6.4 and 6.5), restated
// from the AD-11 matrix (owner, 2026-10-28: the admin has every owner permission plus
// `manage users`). One list for both permission runs: `test/permissions.test.ts` (the modules
// stubbed) and `test/db/permissions.db.test.ts` (signed-in test users against the local
// database, B9 part 2), so the two can't drift.

export const OWNERS: readonly Role[] = ["owner_designer", "admin"];
/** `export` an approved case: every role that may see one (AD-11). */
export const SHARERS: readonly Role[] = ["owner_designer", "admin", "account_sales_social"];
export const ADMIN: readonly Role[] = ["admin"];
/** `manage collections` (Story 5.10a, owner 2026-11-10): every role, admin included. */
export const EVERYONE: readonly Role[] = ["owner_designer", "admin", "account_sales_social"];

/** The roles a person can hold. `system` is the worker's actor: it can't sign in, so it never gets this far. */
export const ROLES: readonly Role[] = ["owner_designer", "account_sales_social", "admin"];

/**
 * Every `"use server"` file of the tool, by path, with a short label for the test names and
 * each export → the roles allowed to call it (AD-11). Listed by hand on purpose: the
 * permission suite discovers the files and their exports itself and fails on any export or
 * file that is not here, so a new action can't skip the check. The sign-in actions in
 * `(auth)` run before there is an actor (Story 6.1) and are left out.
 */
export const EXPECTED: Record<string, { label: string; actions: Record<string, readonly Role[]> }> = {
  "src/app/(tool)/case-studies/actions.ts": {
    label: "case-studies",
    actions: {
      createCaseStudy: OWNERS,
      updateCaseStudyDetails: OWNERS,
      deleteCaseStudy: OWNERS,
      presignAssetUpload: OWNERS,
      confirmAssetUpload: OWNERS,
      listAssets: OWNERS,
      removeAsset: OWNERS,
      setAssetFavourite: OWNERS,
      saveDetailsField: OWNERS,
      saveCaseResults: OWNERS,
      saveCaseTestimonial: OWNERS,
      getDetailsForm: OWNERS,
      generateCaseStudy: OWNERS,
    },
  },
  "src/app/(tool)/clients/actions.ts": {
    label: "clients",
    actions: {
      createClient: OWNERS,
      updateClient: OWNERS,
      addClientSector: OWNERS,
      deleteClient: OWNERS,
      saveClientBriefField: OWNERS,
      saveClientResults: OWNERS,
      saveClientTestimonial: OWNERS,
      requestClientLogoUpload: OWNERS,
      confirmClientLogoUpload: OWNERS,
      requestClientMaterialUpload: OWNERS,
      confirmClientMaterialUpload: OWNERS,
      listClientMaterial: OWNERS,
      removeClientMaterial: OWNERS,
      // A client's intro is started from its page (Story 3.11): `generate`.
      startClientIntro: OWNERS,
    },
  },
  "src/app/(tool)/organization/actions.ts": {
    label: "organization",
    actions: { addUser: ADMIN, changeRole: ADMIN, changeJobTitle: ADMIN, removeUser: ADMIN },
  },
  "src/app/(wizard)/case-studies/[caseId]/configurator/actions.ts": {
    label: "configurator",
    actions: {
      // The autosave (Story 4.3a) and the Media tab's late files (Story 4.5b): `edit`.
      saveRevisionDoc: OWNERS,
      getRenderAssets: OWNERS,
      // Approva (Story 4.8): `approve`.
      approveCase: OWNERS,
      // Editing an approved case (Story 4.9): `edit`, `update approved version`, `discard`.
      forkCaseHead: OWNERS,
      updateApprovedVersion: OWNERS,
      discardCaseChanges: OWNERS,
      // The configurator's field edits (Story 4.3d): `fill details`.
      updateCaseFields: OWNERS,
      saveCaseResults: OWNERS,
      saveCaseTestimonial: OWNERS,
    },
  },
  "src/app/(wizard)/clients/[clientId]/configurator/actions.ts": {
    label: "client-configurator",
    actions: {
      // A client's intro and outro in the configurator (Story 4.11a): `edit`, `approve`.
      saveIntroRevisionDoc: OWNERS,
      approveIntro: OWNERS,
      getIntroRenderAssets: OWNERS,
      // Editing an approved intro (Story 4.11b): `edit`, `update approved version`, `discard`.
      forkIntroHead: OWNERS,
      updateApprovedIntroVersion: OWNERS,
      discardIntroChanges: OWNERS,
      // The client's whole file (Story 4.12a): `edit`, reads only.
      getClientFileRenderAssets: OWNERS,
      reloadFilePart: OWNERS,
      // The order of the client's cases (Story 4.12b): `manage clients`.
      reorderClientCases: OWNERS,
    },
  },
  // The draft-ready poll (Story 3.8): `generate`, a read only.
  "src/app/_lib/draft-ready-actions.ts": { label: "draft-ready", actions: { listReadyDrafts: OWNERS } },
  // Story 5.3: Scarica on an approved case.
  "src/app/(tool)/case-studies/export-actions.ts": {
    label: "export",
    actions: { requestCaseExport: SHARERS, getCaseExportStatus: SHARERS },
  },
  // Story 5.9a: Scarica on a client (its pack); Story 5.9b: every role (`download client pack`).
  "src/app/(tool)/clients/export-actions.ts": {
    label: "client-export",
    actions: { requestClientExport: SHARERS, getClientExportStatus: SHARERS },
  },
  // Story 5.10a: collections, for every role (`manage collections`).
  "src/app/(tool)/collections/actions.ts": {
    label: "collections",
    actions: { createCollection: EVERYONE, renameCollection: EVERYONE, deleteCollection: EVERYONE },
  },
  // Story 5.10a: one collection's page; 5.11a: its own text edits, hidden pages and page
  // orders; 5.10b: its export. Every role, admin included.
  "src/app/(wizard)/collections/[collectionId]/actions.ts": {
    label: "collection",
    actions: {
      moveCollectionGroup: EVERYONE,
      moveCollectionItem: EVERYONE,
      addCollectionItems: EVERYONE,
      removeCollectionItems: EVERYONE,
      retagCollection: EVERYONE,
      setCollectionText: EVERYONE,
      restoreCollectionText: EVERYONE,
      setCollectionPageHidden: EVERYONE,
      setCollectionPageOrder: EVERYONE,
      requestCollectionExport: EVERYONE,
      getCollectionExportStatus: EVERYONE,
    },
  },
};

/** The sign-in actions (Story 6.1): no actor yet, so outside the matrix; `test/authorize-guard.test.ts` checks them. */
export const SIGN_IN_ACTIONS = /^src\/app\/\(auth\)\//;
