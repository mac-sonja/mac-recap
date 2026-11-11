import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile, Role } from "@/modules/access";
import { ok } from "@/shared/result";
import { listServerActionFiles } from "./helpers/authorize-guard";

// Stories 6.4 and 6.5: every server action, for every role, through the real actor resolver
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

const clients = await import("@/app/(tool)/clients/actions");
const organization = await import("@/app/(tool)/organization/actions");
const exportActions = await import("@/app/(tool)/case-studies/export-actions");
const clientExportActions = await import("@/app/(tool)/clients/export-actions");
const jobsModule = await import("@/modules/jobs");
const collectionPageActions = await import("@/app/(wizard)/collections/[collectionId]/actions");
const { default: LibraryPage } = await import("@/app/(tool)/library/page");
const { default: ClientsPage } = await import("@/app/(tool)/clients/page");
const caseStudyModule = await import("@/modules/case-study");
const materialModule = await import("@/modules/material");
const collectionModule = await import("@/modules/collection");

const OWNERS: readonly Role[] = ["owner_designer", "admin"];
/** `export` an approved case: every role that may see one (AD-11). */
const SHARERS: readonly Role[] = ["owner_designer", "admin", "account_sales_social"];
const ADMIN: readonly Role[] = ["admin"];
/** `manage collections` (Story 5.10a, owner 2026-11-10): every role, admin included. */
const EVERYONE: readonly Role[] = ["owner_designer", "admin", "account_sales_social"];

type Action = (input: unknown) => Promise<{ ok: boolean; status?: number }>;

/**
 * Every `"use server"` file of the tool, by path, with a short label for the test names and
 * each export → the roles allowed to call it (AD-11). Listed by hand on purpose: the suite
 * discovers the files and their exports itself (below) and fails on any export or file that
 * is not here, so a new action can't skip the check. The sign-in actions in `(auth)` run
 * before there is an actor (Story 6.1) and are left out.
 */
const EXPECTED: Record<string, { label: string; actions: Record<string, readonly Role[]> }> = {
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
const SIGN_IN_ACTIONS = /^src\/app\/\(auth\)\//;

/** Every `"use server"` file under src/app, found on disk, and its exports, loaded through the mocks above. */
const root = fileURLToPath(new URL("..", import.meta.url));
const DISCOVERED = listServerActionFiles(root, `${root}src/app`).filter((file) => !SIGN_IN_ACTIONS.test(file));
const MODULES: Record<string, Record<string, unknown>> = Object.fromEntries(
  await Promise.all(DISCOVERED.map(async (file) => [file, (await import(`${root}${file}`)) as Record<string, unknown>] as const)),
);

/** Server action (`label.name`) → its function and the roles allowed to call it; only those both listed and found. */
const ACTIONS: Record<string, { call: Action; allowed: readonly Role[] }> = Object.fromEntries(
  Object.entries(EXPECTED).flatMap(([file, { label, actions }]) =>
    Object.entries(actions).flatMap(([name, allowed]) => {
      const call = MODULES[file]?.[name];
      return typeof call === "function" ? [[`${label}.${name}`, { call: call as Action, allowed }] as const] : [];
    }),
  ),
);

/** The roles a person can hold. `system` is the worker's actor: it can't sign in, so it never gets this far (below). */
const ROLES: readonly Role[] = ["owner_designer", "account_sales_social", "admin"];

const cells = Object.entries(ACTIONS).flatMap(([name, { call, allowed }]) =>
  ROLES.map((role) => ({ name, call, role, allowed: allowed.includes(role) })),
);

beforeEach(() => {
  session.email = "persona@menatcode.it";
  session.profileEmail = "persona@menatcode.it";
  session.role = "owner_designer";
  session.disabledAt = null;
  // The autosaves read the saved revision's version (Stories 4.3a, 4.11a).
  vi.mocked(caseStudyModule.saveRevisionDoc).mockResolvedValue(ok({ version: 1 } as never));
  vi.mocked(caseStudyModule.saveIntroRevisionDoc).mockResolvedValue(ok({ version: 1 } as never));
  // Approva on a case reads whether other cases still wait (Story 4.8).
  vi.mocked(caseStudyModule.list).mockResolvedValue(ok([]) as never);
  // Approva and Aggiorna on an intro read its status first (Story 4.11b).
  vi.mocked(caseStudyModule.getClientIntroById).mockResolvedValue(ok({ status: "in_review" } as never));
  // The case order's save returns the saved ids (Story 4.12b).
  vi.mocked(caseStudyModule.setClientCaseOrder).mockResolvedValue(ok({ clientId: "c", caseIds: [] }));
});

describe("permission suite through the real actor resolver (Stories 6.4, 6.5)", () => {
  it("finds the tool's server actions on disk", () => {
    expect(DISCOVERED.length).toBeGreaterThan(0);
    expect(DISCOVERED).toEqual(expect.arrayContaining(Object.keys(EXPECTED)));
  });

  it("lists every \"use server\" file under src/app (a new file fails until it is listed)", () => {
    const unlisted = DISCOVERED.filter((file) => !Object.hasOwn(EXPECTED, file));
    expect(unlisted, `"use server" files missing from EXPECTED: ${unlisted.join(", ")}`).toEqual([]);
  });

  it("lists every export of every server action file, and nothing that isn't one", () => {
    const missing = DISCOVERED.flatMap((file) =>
      Object.keys(MODULES[file]).filter((name) => !Object.hasOwn(EXPECTED[file]?.actions ?? {}, name)).map((name) => `${file} › ${name}`),
    );
    expect(missing, `server actions missing from EXPECTED: ${missing.join(", ")}`).toEqual([]);
    const stale = Object.entries(EXPECTED).flatMap(([file, { actions }]) =>
      Object.keys(actions).filter((name) => typeof MODULES[file]?.[name] !== "function").map((name) => `${file} › ${name}`),
    );
    expect(stale, `EXPECTED names actions that don't exist: ${stale.join(", ")}`).toEqual([]);
    expect(Object.keys(ACTIONS).length).toBe(Object.values(MODULES).reduce((n, exports) => n + Object.keys(exports).length, 0));
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

  it.each(Object.entries(ACTIONS))("%s without a session → 401", async (_, { call }) => {
    session.email = null;
    expect(await call({})).toMatchObject({ ok: false, status: 401 });
  });

  it.each(Object.entries(ACTIONS))("%s with a session on the system profile → 401 (it can't sign in)", async (_, { call }) => {
    session.role = "system";
    expect(await call({})).toMatchObject({ ok: false, status: 401 });
  });

  it.each(Object.entries(ACTIONS))("%s with a session but no profile → 401", async (_, { call }) => {
    session.email = "sconosciuto@menatcode.it";
    expect(await call({})).toMatchObject({ ok: false, status: 401 });
  });

  it.each(Object.entries(ACTIONS))("%s from a removed (disabled) admin → 401", async (_, { call }) => {
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

describe("NFR3 guardrail: no role, admin included, changes a guardrail or a permission (Story 6.4)", () => {
  it("has no server action for permissions or guardrails, sign-in actions included", async () => {
    const signIn = Object.keys(await import("@/app/(auth)/actions"));
    const names = [...Object.keys(ACTIONS), ...signIn];
    expect(names.filter((name) => /permission|guardrail|policy|matrix/i.test(name))).toEqual([]);
  });

  it("denies 'change permissions or guardrails' to every role and to system, on any resource", async () => {
    const { authorize } = await vi.importActual<typeof import("@/modules/access")>("@/modules/access");
    const { can, CASE_STATUSES } = await vi.importActual<typeof import("@/modules/access/domain/policy")>("@/modules/access/domain/policy");
    for (const role of [...ROLES, "system"] as const) {
      const decision = authorize({ ...profileFor("x@menatcode.it", role) }, "change permissions or guardrails");
      expect(decision).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
      for (const status of CASE_STATUSES) expect(can(role, "change permissions or guardrails", { status, link: { id: "l" } })).toBe(false);
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

describe("intros, client packs and collections for account/sales/social (Story 6.5)", () => {
  const CLIENT_ID = "cccccccc-0000-4000-8000-000000000001";

  /** Every module function the actions could reach to write a revision, an intro, a case or a client. */
  const contentModules = () =>
    [caseStudyModule, materialModule].flatMap((module) =>
      Object.values(module).filter((value): value is ReturnType<typeof vi.fn> => vi.isMockFunction(value)),
    );

  it("checks every intro, client pack and collection action, each for every role", () => {
    const intro = ["clients.startClientIntro", ...Object.keys(EXPECTED["src/app/(wizard)/clients/[clientId]/configurator/actions.ts"].actions).map((n) => `client-configurator.${n}`)];
    const pack = Object.keys(EXPECTED["src/app/(tool)/clients/export-actions.ts"].actions).map((n) => `client-export.${n}`);
    const collections = [
      ...Object.keys(EXPECTED["src/app/(tool)/collections/actions.ts"].actions).map((n) => `collections.${n}`),
      ...Object.keys(EXPECTED["src/app/(wizard)/collections/[collectionId]/actions.ts"].actions).map((n) => `collection.${n}`),
    ];
    for (const name of [...intro, ...pack, ...collections]) {
      expect(cells.filter((c) => c.name === name).map((c) => c.role).sort(), name).toEqual([...ROLES].sort());
    }
    expect(intro.length + pack.length + collections.length).toBe(1 + 9 + 2 + 3 + 11);
  });

  it("edits a collection's text, pages and order through the collection only: no revision, intro, case or client is written", async () => {
    session.role = "account_sales_social";
    const edits = ["setCollectionText", "restoreCollectionText", "setCollectionPageHidden", "setCollectionPageOrder"] as const;
    for (const fn of contentModules()) fn.mockClear();
    for (const name of edits) {
      const behind = vi.mocked(collectionModule[name]);
      behind.mockClear();
      const result = await collectionPageActions[name]({ collectionId: "c0c0c0c0-0000-4000-8000-000000000001" });
      // Past the policy, into the collection's own use case.
      expect(result.ok || (result.status !== 401 && result.status !== 403), name).toBe(true);
      expect(behind, name).toHaveBeenCalledOnce();
    }
    // Nothing of the case-study or material module ran: no revision, intro, case or client row.
    expect(contentModules().filter((fn) => fn.mock.calls.length > 0)).toEqual([]);
  });

  it("can't edit a client or its intro: every client and intro write is FORBIDDEN before anything is read", async () => {
    session.role = "account_sales_social";
    const writes = [
      ...Object.keys(EXPECTED["src/app/(tool)/clients/actions.ts"].actions).map((n) => `clients.${n}`),
      ...Object.keys(EXPECTED["src/app/(wizard)/clients/[clientId]/configurator/actions.ts"].actions).map((n) => `client-configurator.${n}`),
    ];
    for (const fn of contentModules()) fn.mockClear();
    for (const name of writes) {
      expect(await ACTIONS[name].call({ clientId: CLIENT_ID }), name).toMatchObject({ ok: false, status: 403, error: { code: "FORBIDDEN" } });
    }
    expect(contentModules().filter((fn) => fn.mock.calls.length > 0)).toEqual([]);
  });

  it("sees only the clients with an approved case on Clienti, counted by approved cases", async () => {
    session.role = "account_sales_social";
    const WITH = { id: CLIENT_ID, code: "LUM", name: "Lumen Srl", caseCount: 3, complete: true, logoUrl: null };
    const WITHOUT = { id: "cccccccc-0000-4000-8000-000000000002", code: "ACM", name: "Acme Bozze", caseCount: 2, complete: true, logoUrl: null };
    vi.mocked(caseStudyModule.listClientSummaries).mockResolvedValueOnce(ok([WITH, WITHOUT]) as never);
    const list = vi.mocked(caseStudyModule.list);
    list.mockClear();
    list.mockResolvedValueOnce(ok([{ status: "approved", client: { id: WITH.id } }]) as never);
    vi.mocked(caseStudyModule.getClientIntro).mockResolvedValue(ok(null) as never);
    const { renderToStaticMarkup } = await import("react-dom/server");
    const html = renderToStaticMarkup(await ClientsPage({ searchParams: Promise.resolve({}) }));
    // Only approved cases are read, whatever else exists.
    expect(list).toHaveBeenCalledExactlyOnceWith({ status: "approved" });
    expect(html).toContain("Lumen Srl");
    expect(html).not.toContain("Acme Bozze");
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

describe("NFR7 guardrail: no role exports a case without an approved revision (Story 5.3)", () => {
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

describe("NFR7 guardrail: no role exports a client pack with a revision that isn't approved (Story 5.9a)", () => {
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
    // Each write and the module function behind it: refused before the module is called.
    const writes = [
      [clients.createClient, caseStudyModule.createClient],
      [clients.updateClient, caseStudyModule.updateClient],
      [clients.deleteClient, caseStudyModule.deleteClient],
      [clients.saveClientBriefField, caseStudyModule.saveClientBriefField],
      [clients.startClientIntro, caseStudyModule.startClientIntro],
    ] as const;
    for (const [, behind] of writes) vi.mocked(behind).mockClear();
    for (const [write, behind] of writes) {
      expect(await write({ id: CLIENT_ID })).toMatchObject({ ok: false, status: 403, error: { code: "FORBIDDEN" } });
      expect(behind).not.toHaveBeenCalled();
    }
  });

  it("as account/sales/social: an approved pack is exported (a job for the client) and its status answers (5.9b)", async () => {
    session.role = "account_sales_social";
    const { caseHistoryV2 } = await import("@/modules/generation");
    const { FORMAT_IDS } = await import("@/modules/rendering");
    const doc = caseHistoryV2(FORMAT_IDS);
    const JOB_ID = "99999999-0000-4000-8000-000000000001";
    const listedCase = { ...approvedCase, year: 2026, businessLines: [], status: "approved" };
    vi.mocked(caseStudyModule.listClientCasesInOrder).mockResolvedValue(ok([listedCase]) as never);
    // The case is approved; the client's intro isn't (each case keeps its own pages).
    const getLiveRevision = arrange((subject) =>
      subject.kind === "case" ? { id: "eeeeeeee-0000-4000-8000-000000000001", caseId: subject.id, status: "approved", doc } : null,
    );
    vi.mocked(caseStudyModule.get).mockResolvedValue(ok(listedCase) as never);
    vi.mocked(caseStudyModule.getClientInfoForCase).mockResolvedValue(
      ok({ clientId: CLIENT_ID, name: "Lumen", industry: null, description: null, logoId: null, brief: { context: "", solution: "", results: [], testimonialQuote: "", testimonialAuthor: "" } }) as never,
    );
    const material = await import("@/modules/material");
    vi.mocked(material.getDetailsForm).mockResolvedValue(ok({ context: "", solution: "", results: [], testimonialQuote: "", testimonialAuthor: "" }) as never);
    vi.mocked(jobsModule.enqueue).mockResolvedValue(ok({ id: JOB_ID }) as never);
    vi.mocked(jobsModule.getJobsFor).mockResolvedValue(ok([{ id: JOB_ID, kind: "export", status: "queued", inputHash: "h" }]) as never);

    const result = await clientExportActions.requestClientExport({ clientId: CLIENT_ID, formats: ["presentazione_16_9"] });
    expect(result).toMatchObject({ ok: true, value: { status: "pending" } });
    expect(jobsModule.enqueue).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ subjectId: CLIENT_ID, payload: expect.objectContaining({ subject: { kind: "client", id: CLIENT_ID } }) }),
    );
    expect(await clientExportActions.getClientExportStatus({ clientId: CLIENT_ID, jobId: JOB_ID })).toMatchObject({
      ok: true,
      value: { status: "pending", jobId: JOB_ID },
    });
    expect(getLiveRevision).toHaveBeenCalledWith({ kind: "case", id: CASE_ID });
    expect(caseStudyModule.getEditableRevision).not.toHaveBeenCalled();

    vi.mocked(caseStudyModule.get).mockReset();
    vi.mocked(caseStudyModule.get).mockResolvedValue(ok(null) as never);
    vi.mocked(caseStudyModule.getClientInfoForCase).mockReset();
    vi.mocked(caseStudyModule.getClientInfoForCase).mockResolvedValue(ok(null) as never);
    vi.mocked(material.getDetailsForm).mockReset();
    vi.mocked(material.getDetailsForm).mockResolvedValue(ok(null) as never);
    vi.mocked(jobsModule.enqueue).mockReset();
    vi.mocked(jobsModule.enqueue).mockResolvedValue(ok(null) as never);
    vi.mocked(jobsModule.getJobsFor).mockReset();
    vi.mocked(jobsModule.getJobsFor).mockResolvedValue(ok(null) as never);
  });
});

describe("NFR7 guardrail: no role exports a collection with a revision that isn't approved (Story 5.10b)", () => {
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
