import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile, Role } from "@/modules/access";
import { ok } from "@/shared/result";

// Story 6.4: every server action, for every role, through the real actor resolver
// (`getActor`: session → profile by email → role) and the real policy
// (`authorize`). Only the Supabase adapters and the use cases behind the policy
// are stubbed, so a wrong `authorize` action, a missing check or a resolver bug
// shows up here as a wrong status. The expected roles are restated from the AD-11
// matrix (owner, 2026-10-28: the admin has every owner permission plus `manage users`).

/** The request's session email, and the one profile the database holds. */
const { session } = vi.hoisted(() => ({
  session: {
    email: null as string | null,
    profileEmail: "persona@menatcode.it",
    role: "owner_designer" as string,
    disabledAt: null as string | null,
  },
}));

const profileFor = (email: string, role: string): Profile =>
  ({
    id: "00000000-0000-4000-8000-0000000000e1",
    email,
    displayName: "Test",
    role,
    disabledAt: session.disabledAt,
    jobTitle: null,
    designerRequestedAt: null,
  }) as Profile;

vi.mock("@/modules/access/adapters/supabase/auth-gateway", () => ({
  createSupabaseAuthGateway: () => ({
    currentUser: async () => (session.email === null ? null : { email: session.email, metadata: {} }),
  }),
}));

vi.mock("@/modules/access/adapters/supabase/profile-repository", () => ({
  createSupabaseProfileRepository: () => ({
    findByEmail: async (email: string) =>
      ok(email.toLowerCase() === session.profileEmail ? profileFor(session.profileEmail, session.role) : null),
    findById: async () => ok(null),
    countEnabledAdmins: async () => ok(2),
    listUsers: async () => ok([]),
  }),
}));

vi.mock("@/modules/access/adapters/supabase/auth-admin", () => ({
  createSupabaseAuthAdmin: () => ({ invite: async () => ok(true) }),
}));

vi.mock("@/app/_lib/origin", () => ({ requestOrigin: async () => "http://localhost:3000" }));
// Pages (the library, Story 5.1) resolve the actor outside a request here.
vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  redirect: (path: string) => {
    throw new Error(`REDIRECT ${path}`);
  },
}));

/** Every export of a module replaced by a use case that succeeds: what runs after `authorize` doesn't matter here. */
async function stubbedUseCases(load: () => Promise<Record<string, unknown>>) {
  const original = await load();
  return Object.fromEntries(Object.keys(original).map((name) => [name, vi.fn(async () => ok(null))]));
}
vi.mock("@/modules/case-study", () => stubbedUseCases(() => vi.importActual("@/modules/case-study")));
vi.mock("@/modules/material", () => stubbedUseCases(() => vi.importActual("@/modules/material")));
// Exports (Story 5.3): the job queue is a spy, so the guardrail sees whether anything was enqueued.
vi.mock("@/modules/jobs", () => stubbedUseCases(() => vi.importActual("@/modules/jobs")));
// Exports' stored files (Story 5.10b): none stored yet, so an approved request enqueues a job.
vi.mock("@/modules/rendering/adapters/supabase/export-repository", () => ({
  createSupabaseExportRepository: () => ({ findByHash: async () => ok(null), findById: async () => ok(null), insert: async () => ok(null) }),
}));
// Collections (Story 5.10a): what runs after `authorize` doesn't matter here.
vi.mock("@/modules/collection", () => stubbedUseCases(() => vi.importActual("@/modules/collection")));

const caseStudies = await import("@/app/(tool)/case-studies/actions");
const clients = await import("@/app/(tool)/clients/actions");
const organization = await import("@/app/(tool)/organization/actions");
const configurator = await import("@/app/(wizard)/case-studies/[caseId]/configurator/actions");
const clientConfigurator = await import("@/app/(wizard)/clients/[clientId]/configurator/actions");
const exportActions = await import("@/app/(tool)/case-studies/export-actions");
const clientExportActions = await import("@/app/(tool)/clients/export-actions");
const jobsModule = await import("@/modules/jobs");
const collectionActions = await import("@/app/(tool)/collections/actions");
const collectionPageActions = await import("@/app/(wizard)/collections/[collectionId]/actions");
const { default: LibraryPage } = await import("@/app/(tool)/library/page");
const caseStudyModule = await import("@/modules/case-study");
const collectionModule = await import("@/modules/collection");
const draftReady = await import("@/app/_lib/draft-ready-actions");

const OWNERS: readonly Role[] = ["owner_designer", "admin"];
/** `export` an approved case: every role that may see one (AD-11). */
const SHARERS: readonly Role[] = ["owner_designer", "admin", "account_sales_social"];
const ADMIN: readonly Role[] = ["admin"];
/** `manage collections` (Story 5.10a, owner 2026-11-10): every role, admin included. */
const EVERYONE: readonly Role[] = ["owner_designer", "admin", "account_sales_social"];

type Action = (input: unknown) => Promise<{ ok: boolean; status?: number }>;

/** Server action → the roles allowed to call it. Every exported action of the three files must be here, and the draft-ready poll. */
const EXPECTED: Record<string, { call: Action; allowed: readonly Role[] }> = {
  ...Object.fromEntries(Object.entries(caseStudies).map(([name, call]) => [`case-studies.${name}`, { call: call as Action, allowed: OWNERS }])),
  ...Object.fromEntries(Object.entries(clients).map(([name, call]) => [`clients.${name}`, { call: call as Action, allowed: OWNERS }])),
  ...Object.fromEntries(Object.entries(organization).map(([name, call]) => [`organization.${name}`, { call: call as Action, allowed: ADMIN }])),
  // The configurator's field edits (Story 4.3d): `fill details`.
  "configurator.updateCaseFields": { call: configurator.updateCaseFields as Action, allowed: OWNERS },
  "configurator.saveCaseResults": { call: configurator.saveCaseResults as Action, allowed: OWNERS },
  "configurator.saveCaseTestimonial": { call: configurator.saveCaseTestimonial as Action, allowed: OWNERS },
  // Editing an approved case (Story 4.9): `edit`, `update approved version`, `discard`.
  "configurator.forkCaseHead": { call: configurator.forkCaseHead as Action, allowed: OWNERS },
  "configurator.updateApprovedVersion": { call: configurator.updateApprovedVersion as Action, allowed: OWNERS },
  "configurator.discardCaseChanges": { call: configurator.discardCaseChanges as Action, allowed: OWNERS },
  // A client's intro and outro in the configurator (Story 4.11a): `edit`, `approve`.
  "client-configurator.saveIntroRevisionDoc": { call: clientConfigurator.saveIntroRevisionDoc as Action, allowed: OWNERS },
  "client-configurator.approveIntro": { call: clientConfigurator.approveIntro as Action, allowed: OWNERS },
  "client-configurator.getIntroRenderAssets": { call: clientConfigurator.getIntroRenderAssets as Action, allowed: OWNERS },
  // Editing an approved intro (Story 4.11b): `edit`, `update approved version`, `discard`.
  "client-configurator.forkIntroHead": { call: clientConfigurator.forkIntroHead as Action, allowed: OWNERS },
  "client-configurator.updateApprovedIntroVersion": { call: clientConfigurator.updateApprovedIntroVersion as Action, allowed: OWNERS },
  "client-configurator.discardIntroChanges": { call: clientConfigurator.discardIntroChanges as Action, allowed: OWNERS },
  // The client's whole file (Story 4.12a): `edit`, reads only.
  "client-configurator.getClientFileRenderAssets": { call: clientConfigurator.getClientFileRenderAssets as Action, allowed: OWNERS },
  "client-configurator.reloadFilePart": { call: clientConfigurator.reloadFilePart as Action, allowed: OWNERS },
  // The order of the client's cases (Story 4.12b): `manage clients`.
  "client-configurator.reorderClientCases": { call: clientConfigurator.reorderClientCases as Action, allowed: OWNERS },
  // The draft-ready poll (Story 3.8): `generate`, a read only.
  "draft-ready.listReadyDrafts": { call: draftReady.listReadyDrafts as Action, allowed: OWNERS },
  // Story 5.3: Scarica on an approved case.
  ...Object.fromEntries(Object.entries(exportActions).map(([name, call]) => [`export.${name}`, { call: call as Action, allowed: SHARERS }])),
  // Story 5.9a: Scarica on a client (its pack); Story 5.9b: every role (`download client pack`).
  ...Object.fromEntries(Object.entries(clientExportActions).map(([name, call]) => [`client-export.${name}`, { call: call as Action, allowed: SHARERS }])),
  // Story 5.10a: collections, for every role. Story 5.11a adds the collection's own text edits,
  // hidden pages and page orders to the page's actions: every role too, admin included.
  ...Object.fromEntries(Object.entries(collectionActions).map(([name, call]) => [`collections.${name}`, { call: call as Action, allowed: EVERYONE }])),
  ...Object.fromEntries(Object.entries(collectionPageActions).map(([name, call]) => [`collection.${name}`, { call: call as Action, allowed: EVERYONE }])),
};

/** The roles a person can hold. `system` is the worker's actor: it can't sign in, so it never gets this far (below). */
const ROLES: readonly Role[] = ["owner_designer", "account_sales_social", "admin"];

const cells = Object.entries(EXPECTED).flatMap(([name, { call, allowed }]) =>
  ROLES.map((role) => ({ name, call, role, allowed: allowed.includes(role) })),
);

beforeEach(() => {
  session.email = "persona@menatcode.it";
  session.profileEmail = "persona@menatcode.it";
  session.role = "owner_designer";
  session.disabledAt = null;
  // The intro save reads the saved revision's version (Story 4.11a).
  vi.mocked(caseStudyModule.saveIntroRevisionDoc).mockResolvedValue(ok({ version: 1 } as never));
  // Approva and Aggiorna on an intro read its status first (Story 4.11b).
  vi.mocked(caseStudyModule.getClientIntroById).mockResolvedValue(ok({ status: "in_review" } as never));
  // The case order's save returns the saved ids (Story 4.12b).
  vi.mocked(caseStudyModule.setClientCaseOrder).mockResolvedValue(ok({ clientId: "c", caseIds: [] }));
});

describe("permission suite through the real actor resolver (Story 6.4)", () => {
  it("covers every server action of the tool", () => {
    expect(Object.keys(EXPECTED).length).toBe(
      Object.keys(caseStudies).length + Object.keys(clients).length + Object.keys(organization).length + 6 + Object.keys(clientConfigurator).length + Object.keys(draftReady).length + Object.keys(exportActions).length + Object.keys(clientExportActions).length + Object.keys(collectionActions).length + Object.keys(collectionPageActions).length,
    );
  });

  it.each(cells)("$name as $role → allowed: $allowed", async ({ call, role, allowed }) => {
    session.role = role;
    const result = await call({});
    if (allowed) {
      // Past the policy: the use case ran (ok) or rejected the empty input (400), never 401/403.
      expect(result.ok || (result.status !== 401 && result.status !== 403)).toBe(true);
    } else {
      expect(result).toMatchObject({ ok: false, status: 403 });
    }
  });

  it.each(Object.entries(EXPECTED))("%s without a session → 401", async (_, { call }) => {
    session.email = null;
    expect(await call({})).toMatchObject({ ok: false, status: 401 });
  });

  it.each(Object.entries(EXPECTED))("%s with a session on the system profile → 401 (it can't sign in)", async (_, { call }) => {
    session.role = "system";
    expect(await call({})).toMatchObject({ ok: false, status: 401 });
  });

  it.each(Object.entries(EXPECTED))("%s with a session but no profile → 401", async (_, { call }) => {
    session.email = "sconosciuto@menatcode.it";
    expect(await call({})).toMatchObject({ ok: false, status: 401 });
  });

  it.each(Object.entries(EXPECTED))("%s from a removed (disabled) admin → 401", async (_, { call }) => {
    session.role = "admin";
    session.disabledAt = "2026-10-28T10:00:00Z";
    expect(await call({})).toMatchObject({ ok: false, status: 401 });
  });

  it("matches the session to the profile case-insensitively", async () => {
    session.email = "Persona@MenatCode.it";
    session.role = "admin";
    const result = await organization.changeJobTitle({});
    expect(result).toMatchObject({ ok: false, status: 400 });
  });
});

describe("no role, admin included, changes a guardrail or a permission (Story 6.4, NFR3)", () => {
  it("has no server action for permissions or guardrails", () => {
    const names = Object.keys(EXPECTED).join(" ");
    expect(names).not.toMatch(/permission|guardrail|policy|matrix/i);
  });

  it("denies 'change permissions or guardrails' to every role", async () => {
    const { authorize } = await vi.importActual<typeof import("@/modules/access")>("@/modules/access");
    for (const role of [...ROLES, "system"] as const) {
      const decision = authorize({ ...profileFor("x@menatcode.it", role) }, "change permissions or guardrails");
      expect(decision.ok).toBe(false);
    }
  });

  it("gives account/sales/social no write action: no create, edit, approve, delete or client change", () => {
    // Exporting an approved case writes no content (only its file and an `export` event). A
    // collection (Story 5.10a, every role) holds case ids only: it never writes a case, a revision or a client.
    // A client's pack (Story 5.9b) is an export too: its file and an `export` event per case, no content.
    const ownsNoContent = (name: string) =>
      name.startsWith("export.") || name.startsWith("client-export.") || name.startsWith("collections.") || name.startsWith("collection.");
    const writable = cells.filter((c) => c.role === "account_sales_social" && c.allowed && !ownsNoContent(c.name));
    expect(writable).toEqual([]);
    // Story 5.11a: the collection's own edits are there and allowed for every role; they too
    // write the collection only (test/db/collection.db.test.ts proves no original row changes).
    for (const name of ["setCollectionText", "restoreCollectionText", "setCollectionPageHidden", "setCollectionPageOrder"]) {
      expect(cells.filter((c) => c.name === `collection.${name}` && c.allowed).map((c) => c.role).sort(), name).toEqual([...EVERYONE].sort());
    }
    expect(cells.filter((c) => c.name.startsWith("export.") && c.allowed).map((c) => c.role)).toEqual(
      expect.arrayContaining(["account_sales_social"]),
    );
    expect(cells.filter((c) => c.name.startsWith("client-export.") && c.allowed).map((c) => c.role)).toEqual(
      expect.arrayContaining(["account_sales_social"]),
    );
  });
});

describe("the library listing (Story 5.1)", () => {
  const APPROVED_ID = "aaaaaaaa-0000-4000-8000-000000000001";
  const WAITING_ID = "aaaaaaaa-0000-4000-8000-000000000002";
  const listed = (id: string, status: string) => ({
    id,
    code: `LUM-2026-${id.slice(-2)}`,
    name: `Caso ${id.slice(-1)}`,
    client: { id: "cccccccc-0000-4000-8000-000000000001", name: "Lumen Srl", code: "LUM" },
    year: 2026,
    businessLines: [],
    status,
    updatedAt: "2026-10-20T10:00:00+00:00",
    approvedAt: status === "approved" ? "2026-10-20T10:00:00+00:00" : null,
  });

  it.each(["account_sales_social", "owner_designer", "admin"] as const)(
    "as %s lists approved cases only, and covers read only the live revision",
    async (role) => {
      session.role = role;
      const list = vi.mocked(caseStudyModule.list);
      const getLiveRevision = vi.mocked(caseStudyModule.getLiveRevision);
      const getEditableRevision = vi.mocked(caseStudyModule.getEditableRevision);
      list.mockClear();
      getLiveRevision.mockClear();
      getEditableRevision.mockClear();
      // Even if a working case slipped into the list, it never becomes a card.
      list.mockResolvedValueOnce(ok([listed(APPROVED_ID, "approved"), listed(WAITING_ID, "in_review")]) as never);
      const { renderToStaticMarkup } = await import("react-dom/server");
      const html = renderToStaticMarkup(await LibraryPage({ searchParams: Promise.resolve({}) }));
      expect(list).toHaveBeenCalledExactlyOnceWith({ status: "approved" });
      expect(html).toContain(`/case-studies/${APPROVED_ID}`);
      expect(html).not.toContain(WAITING_ID);
      expect(getLiveRevision).toHaveBeenCalledExactlyOnceWith({ kind: "case", id: APPROVED_ID });
      expect(getEditableRevision).not.toHaveBeenCalled();
    },
  );
});

describe("no role exports a case without an approved revision (Story 5.3, NFR1)", () => {
  const CASE_ID = "aaaaaaaa-0000-4000-8000-000000000001";

  it.each(["owner_designer", "admin", "account_sales_social"] as const)("as %s: NOT_APPROVED, nothing enqueued", async (role) => {
    session.role = role;
    const get = vi.mocked(caseStudyModule.get);
    const getLiveRevision = vi.mocked(caseStudyModule.getLiveRevision);
    const getEditableRevision = vi.mocked(caseStudyModule.getEditableRevision);
    const enqueue = vi.mocked(jobsModule.enqueue);
    enqueue.mockClear();
    getEditableRevision.mockClear();
    get.mockResolvedValue(ok({ id: CASE_ID, code: "LUM-2026-01", name: "Caso", year: 2026, businessLines: [], status: "in_review" }) as never);
    // The case has a working head, but nothing approved.
    getLiveRevision.mockResolvedValue(ok(null) as never);
    for (const format of ["presentazione_16_9", "carosello_1_1"]) {
      const result = await exportActions.requestCaseExport({ caseId: CASE_ID, format });
      expect(result).toMatchObject({ ok: false, status: 409, error: { code: "NOT_APPROVED" } });
    }
    expect(await exportActions.getCaseExportStatus({ caseId: CASE_ID, exportId: CASE_ID })).toMatchObject({
      ok: false,
      error: { code: "NOT_APPROVED" },
    });
    expect(getLiveRevision).toHaveBeenCalledWith({ kind: "case", id: CASE_ID });
    expect(getEditableRevision).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });
});

describe("no role exports a client pack with a revision that isn't approved (Story 5.9a, NFR1)", () => {
  const CLIENT_ID = "cccccccc-0000-4000-8000-000000000001";
  const CASE_ID = "aaaaaaaa-0000-4000-8000-000000000001";
  const INTRO_ID = "dddddddd-0000-4000-8000-000000000001";
  const approvedCase = { id: CASE_ID, code: "LUM-2026-01", name: "Caso", client: { id: CLIENT_ID, name: "Lumen", code: "LUM" }, deletedAt: null };

  function arrange(live: (subject: { kind: string; id: string }) => unknown) {
    const getLiveRevision = vi.mocked(caseStudyModule.getLiveRevision);
    vi.mocked(caseStudyModule.getClient).mockResolvedValue(ok({ id: CLIENT_ID, code: "LUM", name: "Lumen" }) as never);
    vi.mocked(caseStudyModule.getClientIntro).mockResolvedValue(ok({ id: INTRO_ID }) as never);
    getLiveRevision.mockReset();
    getLiveRevision.mockImplementation(async (subject) => ok(live(subject as { kind: string; id: string })) as never);
    vi.mocked(caseStudyModule.getEditableRevision).mockClear();
    vi.mocked(jobsModule.enqueue).mockClear();
    return getLiveRevision;
  }

  afterEach(() => {
    vi.mocked(caseStudyModule.listClientCasesInOrder).mockReset();
    vi.mocked(caseStudyModule.listClientCasesInOrder).mockResolvedValue(ok([]) as never);
  });

  it.each(["owner_designer", "admin", "account_sales_social"] as const)("as %s: a client with only cases not approved is NOT_APPROVED, nothing enqueued", async (role) => {
    session.role = role;
    // Bozza or Da approvare cases only: the client has no approved case to list.
    vi.mocked(caseStudyModule.listClientCasesInOrder).mockResolvedValue(ok([]) as never);
    arrange(() => null);
    for (const format of ["presentazione_16_9", "carosello_1_1"]) {
      const result = await clientExportActions.requestClientExport({ clientId: CLIENT_ID, formats: [format] });
      expect(result).toMatchObject({ ok: false, status: 409, error: { code: "NOT_APPROVED" } });
    }
    expect(await clientExportActions.getClientExportStatus({ clientId: CLIENT_ID, exportId: CASE_ID })).toMatchObject({
      ok: false,
      error: { code: "NOT_APPROVED" },
    });
    expect(caseStudyModule.getEditableRevision).not.toHaveBeenCalled();
    expect(jobsModule.enqueue).not.toHaveBeenCalled();
  });

  it.each(["owner_designer", "admin", "account_sales_social"] as const)("as %s: a listed case whose approved revision is gone is left out, never its working copy", async (role) => {
    session.role = role;
    vi.mocked(caseStudyModule.listClientCasesInOrder).mockResolvedValue(ok([approvedCase]) as never);
    // The case has a working head but no live revision any more; the intro isn't approved either.
    const getLiveRevision = arrange(() => null);
    const result = await clientExportActions.requestClientExport({ clientId: CLIENT_ID, formats: ["presentazione_16_9"] });
    expect(result).toMatchObject({ ok: false, status: 409, error: { code: "NOT_APPROVED" } });
    expect(getLiveRevision).toHaveBeenCalledWith({ kind: "case", id: CASE_ID });
    expect(caseStudyModule.getEditableRevision).not.toHaveBeenCalled();
    expect(jobsModule.enqueue).not.toHaveBeenCalled();
  });

  it("as account/sales/social: the pack is theirs, yet every client write is FORBIDDEN before anything is read (5.9b)", async () => {
    session.role = "account_sales_social";
    vi.mocked(caseStudyModule.listClientCasesInOrder).mockResolvedValue(ok([approvedCase]) as never);
    arrange(() => null);
    // Past the policy: the pack is read (its approved revisions only), as for an owner.
    expect(await clientExportActions.requestClientExport({ clientId: CLIENT_ID, formats: ["presentazione_16_9"] })).toMatchObject({
      ok: false,
      status: 409,
      error: { code: "NOT_APPROVED" },
    });
    expect(caseStudyModule.listClientCasesInOrder).toHaveBeenCalledWith(CLIENT_ID);
    const updateClient = vi.mocked(caseStudyModule.updateClient);
    updateClient.mockClear();
    for (const write of [clients.createClient, clients.updateClient, clients.deleteClient, clients.saveClientBriefField, clients.startClientIntro]) {
      expect(await write({ id: CLIENT_ID })).toMatchObject({ ok: false, status: 403, error: { code: "FORBIDDEN" } });
    }
    expect(updateClient).not.toHaveBeenCalled();
  });
});

describe("no role exports a collection with a revision that isn't approved (Story 5.10b, NFR1)", () => {
  const COLLECTION_ID = "c0c0c0c0-0000-4000-8000-000000000001";
  const CLIENT_ID = "cccccccc-0000-4000-8000-000000000001";
  const CASE_ID = "aaaaaaaa-0000-4000-8000-000000000001";
  const OTHER_ID = "aaaaaaaa-0000-4000-8000-000000000002";
  const caseOf = (id: string) => ({ id, code: "LUM-2026-01", name: "Caso", year: 2026, businessLines: [], status: "approved", client: { id: CLIENT_ID, name: "Lumen", code: "LUM" }, deletedAt: null });

  function arrange(live: (subject: { kind: string; id: string }) => unknown) {
    vi.mocked(collectionModule.getCollection).mockResolvedValue(
      ok({ id: COLLECTION_ID, name: "Pitch moda", version: 1, items: [CASE_ID, OTHER_ID].map((id) => ({ case: caseOf(id), revision: null })) }) as never,
    );
    vi.mocked(caseStudyModule.get).mockImplementation(async (id) => ok(caseOf(id as string)) as never);
    vi.mocked(caseStudyModule.getClientIntro).mockResolvedValue(ok({ id: "dddddddd-0000-4000-8000-000000000001" }) as never);
    // Story 5.11b: the export reads the collection's edits too; none here.
    vi.mocked(collectionModule.getCollectionEdits).mockResolvedValue(ok({ textEdits: [], hiddenPages: [], pageOrders: [] }));
    const getLiveRevision = vi.mocked(caseStudyModule.getLiveRevision);
    getLiveRevision.mockReset();
    getLiveRevision.mockImplementation(async (subject) => ok(live(subject as { kind: string; id: string })) as never);
    vi.mocked(caseStudyModule.getEditableRevision).mockClear();
    vi.mocked(jobsModule.enqueue).mockClear();
    vi.mocked(collectionModule.recordCollectionExported).mockClear();
    return getLiveRevision;
  }

  afterEach(() => {
    vi.mocked(collectionModule.getCollection).mockReset();
    vi.mocked(collectionModule.getCollection).mockResolvedValue(ok(null) as never);
    vi.mocked(collectionModule.getCollectionEdits).mockReset();
    vi.mocked(collectionModule.getCollectionEdits).mockResolvedValue(ok({ textEdits: [], hiddenPages: [], pageOrders: [] }));
    vi.mocked(caseStudyModule.get).mockReset();
    vi.mocked(caseStudyModule.get).mockResolvedValue(ok(null) as never);
  });

  it.each(["owner_designer", "admin", "account_sales_social"] as const)(
    "as %s: cases with only a working copy are NOT_APPROVED, read from live revisions only, nothing enqueued",
    async (role) => {
      session.role = role;
      // Both cases have a working head, but no live revision; the client's intro isn't approved either.
      const getLiveRevision = arrange(() => null);
      for (const format of ["presentazione_16_9", "carosello_1_1"]) {
        const result = await collectionPageActions.requestCollectionExport({ collectionId: COLLECTION_ID, formats: [format] });
        expect(result).toMatchObject({ ok: false, status: 409, error: { code: "NOT_APPROVED" } });
      }
      expect(await collectionPageActions.getCollectionExportStatus({ collectionId: COLLECTION_ID, exportId: CASE_ID })).toMatchObject({
        ok: false,
        error: { code: "NOT_APPROVED" },
      });
      expect(getLiveRevision).toHaveBeenCalledWith({ kind: "case", id: CASE_ID });
      expect(getLiveRevision).toHaveBeenCalledWith({ kind: "case", id: OTHER_ID });
      expect(caseStudyModule.getEditableRevision).not.toHaveBeenCalled();
      expect(jobsModule.enqueue).not.toHaveBeenCalled();
      expect(collectionModule.recordCollectionExported).not.toHaveBeenCalled();
    },
  );

  it.each(["admin", "account_sales_social"] as const)("as %s: an approved collection is exported (a job for the collection)", async (role) => {
    session.role = role;
    const { caseHistoryV2 } = await import("@/modules/generation");
    const { FORMAT_IDS } = await import("@/modules/rendering");
    const doc = caseHistoryV2(FORMAT_IDS);
    // Both cases approved; the client's intro isn't.
    const getLiveRevision = arrange((subject) => (subject.kind === "case" ? { id: `eeeeeeee-0000-4000-8000-0000000000${subject.id.slice(-2)}`, caseId: subject.id, status: "approved", doc } : null));
    vi.mocked(caseStudyModule.getClientInfoForCase).mockResolvedValue(
      ok({ clientId: CLIENT_ID, name: "Lumen", industry: null, description: null, logoId: null, brief: { context: "", solution: "", results: [], testimonialQuote: "", testimonialAuthor: "" } }) as never,
    );
    const material = await import("@/modules/material");
    vi.mocked(material.getDetailsForm).mockResolvedValue(ok({ context: "", solution: "", results: [], testimonialQuote: "", testimonialAuthor: "" }) as never);
    vi.mocked(jobsModule.enqueue).mockResolvedValue(ok({ id: "99999999-0000-4000-8000-000000000001" }) as never);
    const result = await collectionPageActions.requestCollectionExport({ collectionId: COLLECTION_ID, formats: ["presentazione_16_9"] });
    expect(result).toMatchObject({ ok: true, value: { status: "pending" } });
    expect(jobsModule.enqueue).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ subjectId: COLLECTION_ID, payload: expect.objectContaining({ subject: { kind: "collection", id: COLLECTION_ID } }) }),
    );
    expect(getLiveRevision).toHaveBeenCalledWith({ kind: "case", id: CASE_ID });
    expect(caseStudyModule.getEditableRevision).not.toHaveBeenCalled();
    vi.mocked(caseStudyModule.getClientInfoForCase).mockReset();
    vi.mocked(caseStudyModule.getClientInfoForCase).mockResolvedValue(ok(null) as never);
    vi.mocked(material.getDetailsForm).mockReset();
    vi.mocked(material.getDetailsForm).mockResolvedValue(ok(null) as never);
    vi.mocked(jobsModule.enqueue).mockReset();
    vi.mocked(jobsModule.enqueue).mockResolvedValue(ok(null) as never);
  });
});
