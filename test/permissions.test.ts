import { beforeEach, describe, expect, it, vi } from "vitest";
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

const caseStudies = await import("@/app/(tool)/case-studies/actions");
const clients = await import("@/app/(tool)/clients/actions");
const organization = await import("@/app/(tool)/organization/actions");
const configurator = await import("@/app/(wizard)/case-studies/[caseId]/configurator/actions");
const clientConfigurator = await import("@/app/(wizard)/clients/[clientId]/configurator/actions");
const exportActions = await import("@/app/(tool)/case-studies/export-actions");
const jobsModule = await import("@/modules/jobs");
const { default: LibraryPage } = await import("@/app/(tool)/library/page");
const caseStudyModule = await import("@/modules/case-study");
const draftReady = await import("@/app/_lib/draft-ready-actions");

const OWNERS: readonly Role[] = ["owner_designer", "admin"];
/** `export` an approved case: every role that may see one (AD-11). */
const SHARERS: readonly Role[] = ["owner_designer", "admin", "account_sales_social"];
const ADMIN: readonly Role[] = ["admin"];

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
      Object.keys(caseStudies).length + Object.keys(clients).length + Object.keys(organization).length + 6 + Object.keys(clientConfigurator).length + Object.keys(draftReady).length + Object.keys(exportActions).length,
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
    // Exporting an approved case writes no content (only its file and an `export` event).
    const writable = cells.filter((c) => c.role === "account_sales_social" && c.allowed && !c.name.startsWith("export."));
    expect(writable).toEqual([]);
    expect(cells.filter((c) => c.name.startsWith("export.") && c.allowed).map((c) => c.role)).toEqual(
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
