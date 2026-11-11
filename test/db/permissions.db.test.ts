// Story 6.4 (B9 part 2): the permission matrix end to end, against the local Supabase stack,
// with one real signed-in test user per role (test/helpers/db-actor.ts, signed in once each in
// test/db/global-setup.ts). Nothing of the access path is stubbed: the session cookies go
// through the real Supabase Auth server, `getActor` reads the real `profile` row, `authorize`
// runs the AD-11 matrix, and the modules write the real tables. The expected outcome per action
// and role is the EXPECTED map shared with test/permissions.test.ts
// (test/helpers/permission-matrix.ts). Run with `npm run test:db`.
//
// For each role: every action EXPECTED denies is FORBIDDEN and a snapshot of every table taken
// before and after shows no row changed; every action it allows gets past the policy; and the
// representative allowed actions run for real on seeded data (a client, an approved case, a
// draft case, a collection). A disabled profile and no session are refused (401).
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import type { Role } from "@/modules/access";
import { switchSession, TEST_ACTOR_ID, TEST_ROLES, TEST_USERS, TestCookieStore, type TestRole } from "../helpers/db-actor";
import { addTestLogo, createTestClient, nameWithLetters, freshPrefix, TEST_DESCRIPTION, TEST_INDUSTRY, type TestClient } from "../helpers/db-clients";
import { listServerActionFiles } from "../helpers/authorize-guard";
import { EXPECTED, OWNERS, SIGN_IN_ACTIONS } from "../helpers/permission-matrix";

const REQUIRED = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_DB_URL"] as const;
const missing = REQUIRED.filter((name) => !process.env[name]);
if (missing.length > 0) {
  throw new Error(`Missing ${missing.join(", ")}: run the DB suite with \`npm run test:db\` (start the stack with \`npm run db:start\`).`);
}

// Outside a Next request: the request's origin (only `addUser` reads it, for the invite link),
// `connection()` and the navigation helpers a page calls. `redirect` throws, as Next's does.
vi.mock("@/app/_lib/origin", () => ({ requestOrigin: async () => "http://localhost:3000" }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => undefined }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} }),
  redirect: (path: string) => {
    throw new Error(`REDIRECT ${path}`);
  },
}));

type ActionResult = { ok: boolean; status?: number; error?: { code: string }; value?: unknown };
type Action = (input: unknown) => Promise<ActionResult>;

/** Every `"use server"` file under src/app (the sign-in actions aside), loaded unmocked. */
const root = fileURLToPath(new URL("../..", import.meta.url));
const DISCOVERED = listServerActionFiles(root, `${root}src/app`).filter((file) => !SIGN_IN_ACTIONS.test(file));
const MODULES: Record<string, Record<string, unknown>> = Object.fromEntries(
  await Promise.all(DISCOVERED.map(async (file) => [file, (await import(`${root}${file}`)) as Record<string, unknown>] as const)),
);

/** Server action (`label.name`) → its function and the roles EXPECTED allows. */
const ACTIONS: Record<string, { call: Action; allowed: readonly Role[] }> = Object.fromEntries(
  Object.entries(EXPECTED).flatMap(([file, { label, actions }]) =>
    Object.entries(actions).flatMap(([name, allowed]) => {
      const call = MODULES[file]?.[name];
      return typeof call === "function" ? [[`${label}.${name}`, { call: call as Action, allowed }] as const] : [];
    }),
  ),
);
const action = (name: string) => {
  const found = ACTIONS[name];
  if (!found) throw new Error(`no server action ${name} in EXPECTED`);
  return found.call;
};
const deniedTo = (role: TestRole) => Object.keys(ACTIONS).filter((name) => !ACTIONS[name].allowed.includes(role));
const allowedTo = (role: TestRole) => Object.keys(ACTIONS).filter((name) => ACTIONS[name].allowed.includes(role));

/** Each role's session, kept for the whole file so a refreshed token stays with its role. */
const roleCookies = inject("dbRoleCookies");
const stores = Object.fromEntries(TEST_ROLES.map((role) => [role, new TestCookieStore(roleCookies[role])])) as Record<TestRole, TestCookieStore>;
const signInAs = (role: TestRole) => switchSession(stores[role]);

let pool: pg.Pool;

/** The tables whose rows an action could write: everything in `public`, and the stored objects. */
async function snapshot(): Promise<Record<string, string>> {
  const { rows: tables } = await pool.query<{ schema: string; name: string }>(
    `select n.nspname as schema, c.relname as name from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r', 'p') and (n.nspname = 'public' or (n.nspname = 'storage' and c.relname = 'objects')) order by 1, 2`,
  );
  const out: Record<string, string> = {};
  for (const { schema, name } of tables) {
    const { rows } = await pool.query<{ n: number; h: string }>(
      `select count(*)::int as n, md5(coalesce(string_agg(t::text, E'\\n' order by t::text), '')) as h from "${schema}"."${name}" t`,
    );
    out[`${schema}.${name}`] = `${rows[0].n}:${rows[0].h}`;
  }
  return out;
}

const F = "presentazione_16_9";

/** The seeded data every role works on (beforeAll). */
const seed = {
  /** A client with an approved case, a draft and the cases the owners approve. */
  client: null as unknown as TestClient,
  /** A client with a draft only: account/sales/social must not see it on Clienti. */
  draftOnlyClient: null as unknown as TestClient,
  approvedCaseId: "",
  draftCaseId: "",
  collectionId: "",
  /** Where a free text of the approved case sits, for the collection's text edit. */
  pageKey: "",
  elementId: "",
  /** The reference v2 case history with its files replaced by live files of `client`. */
  doc: null as unknown,
};
/** Export jobs enqueued here, removed at the end so no later run picks them up. */
const enqueuedJobs: string[] = [];

async function ownerActor() {
  signInAs("owner_designer");
  const { getActor } = await import("@/modules/access");
  const result = await getActor();
  if (!result.ok) throw new Error(`signed-in test owner did not resolve: ${result.error.code}`);
  return result.value;
}

/** A case of `clientId` walked to `in_review` (or on to `approved`) through the repository's transitions. */
async function caseOf(clientId: string, name: string, to: "draft" | "in_review" | "approved") {
  const { create } = await import("@/modules/case-study");
  const created = await create(await ownerActor(), { name, clientId, year: 2026, businessLines: ["branding"] });
  if (!created.ok) throw new Error(`setup create failed: ${created.error.code}`);
  const steps = [
    ["generate", "draft", "generating"],
    ["generation_succeeded", "generating", "in_review"],
    ["approve", "in_review", "approved"],
  ] as const;
  const count = to === "draft" ? 0 : to === "in_review" ? 2 : 3;
  const { createSupabaseCaseStudyRepository } = await import("@/modules/case-study/adapters/supabase/case-study-repository");
  const repo = createSupabaseCaseStudyRepository();
  for (const [event, from, next] of steps.slice(0, count)) {
    const moved = await repo.transition({ caseId: created.value.id, event, from, to: next, actorId: TEST_ACTOR_ID });
    if (!moved.ok) throw new Error(`setup ${event} failed: ${moved.error.code}`);
  }
  return created.value.id;
}

/** A case in review whose head is a working revision of `seed.doc`, ready for the configurator. */
async function reviewCase(name: string) {
  const caseId = await caseOf(seed.client.id, name, "draft");
  await pool.query("select * from public.create_working_revision($1, $2, $3, $4, $5, $6)", [
    caseId,
    JSON.stringify(seed.doc),
    "{}",
    JSON.stringify({ model: null, fellBack: false, promptVersion: null }),
    0,
    TEST_ACTOR_ID,
  ]);
  const { transition } = await import("@/modules/case-study");
  const actor = await ownerActor();
  for (const event of ["generate", "generation_succeeded"] as const) {
    const moved = await transition(caseId, event, actor);
    if (!moved.ok) throw new Error(`setup transition ${event} failed: ${moved.error.code}`);
  }
  const { rows } = await pool.query<{ head_revision_id: string }>("select head_revision_id from public.case_study where id = $1", [caseId]);
  return { caseId, revisionId: rows[0].head_revision_id };
}

const headVersion = async (caseId: string) =>
  (await pool.query<{ head_version: number }>("select head_version from public.case_study where id = $1", [caseId])).rows[0].head_version;

/** Every row a collection's edits must never write: the case's revisions and row, the client and its intros. */
async function originals(caseId: string, clientId: string) {
  const q = async (sql: string, id: string) => (await pool.query(sql, [id])).rows;
  return {
    revisions: await q("select * from public.revision where case_id = $1 order by id", caseId),
    caseRow: await q("select * from public.case_study where id = $1", caseId),
    client: await q("select * from public.client where id = $1", clientId),
    intros: await q("select * from public.client_intro where client_id = $1", clientId),
  };
}

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: process.env.SUPABASE_DB_URL, max: 2 });
  seed.client = await createTestClient(pool, TEST_ACTOR_ID);
  seed.draftOnlyClient = await createTestClient(pool, TEST_ACTOR_ID);

  // The reference document, its files made live files of the client so Approva finds them all.
  const { caseHistoryV2 } = await import("@/modules/generation");
  const { FORMAT_IDS } = await import("@/modules/rendering");
  const { referencedAssetIds } = await import("@/modules/case-study");
  let json = JSON.stringify(caseHistoryV2(FORMAT_IDS));
  for (const id of referencedAssetIds(caseHistoryV2(FORMAT_IDS))) {
    const fresh = randomUUID();
    json = json.replaceAll(id, fresh);
    await pool.query("select public.insert_client_asset($1, $2, $3, 'vetrina.pdf', 'application/pdf', 10, null, null, $4)", [
      fresh,
      seed.client.id,
      `clients/${seed.client.id}/material/${fresh}.pdf`,
      TEST_ACTOR_ID,
    ]);
  }
  seed.doc = JSON.parse(json);

  // The approved case: its live approved revision is that document.
  seed.approvedCaseId = await caseOf(seed.client.id, "Approvato", "approved");
  const { rows } = await pool.query(
    "insert into public.revision (case_id, status, generated_doc, doc, schema_version, created_by) values ($1, 'approved', $2, $2, 2, $3) returning id",
    [seed.approvedCaseId, json, TEST_ACTOR_ID],
  );
  await pool.query("update public.case_study set approved_revision_id = $2 where id = $1", [seed.approvedCaseId, rows[0].id]);
  seed.draftCaseId = await caseOf(seed.client.id, "Bozza", "draft");
  await caseOf(seed.draftOnlyClient.id, "Solo bozza", "draft");

  type El = { elementId: string; type: string; text?: string; items?: El[] };
  const all = (els: El[]): El[] => els.flatMap((el) => [el, ...all(el.items ?? [])]);
  const pages = (seed.doc as { formats: Record<string, { pages: { pageKey: string; blocks: { elements: El[] }[] }[] }> }).formats[F].pages;
  const page = pages.find((p) => p.blocks.some((b) => all(b.elements).some((el) => el.type === "text" && el.text !== undefined)))!;
  seed.pageKey = page.pageKey;
  seed.elementId = page.blocks.flatMap((b) => all(b.elements)).find((el) => el.type === "text" && el.text !== undefined)!.elementId;

  const { createCollection } = await import("@/modules/collection");
  const made = await createCollection(await ownerActor(), {
    name: "Pitch permessi",
    businessLines: ["branding"],
    industries: [TEST_INDUSTRY],
    caseIds: [seed.approvedCaseId],
  });
  if (!made.ok) throw new Error(`setup collection failed: ${made.error.code}`);
  seed.collectionId = made.value.collectionId;
});

afterAll(async () => {
  signInAs("owner_designer");
  if (enqueuedJobs.length > 0) await pool.query("delete from public.job where id = any($1::uuid[])", [enqueuedJobs]);
  // Undo what the run changed on the test users, whatever failed.
  await pool.query("update public.profile set disabled_at = null, job_title = null where id = any($1::uuid[])", [
    [TEST_USERS.admin.id, TEST_USERS.account_sales_social.id],
  ]);
  await pool.end();
});

/** The same input for every denied call: real ids, so a missing check would reach real rows. */
const target = () => ({
  caseId: seed.draftCaseId,
  clientId: seed.client.id,
  collectionId: seed.collectionId,
  id: seed.client.id,
  profileId: TEST_USERS.account_sales_social.id,
  role: "admin",
  status: "draft",
  name: "Cambiato",
  jobTitle: "Cambiato",
});

describe("NFR3 guardrail: the permission matrix end to end, signed in per role (Story 6.4, B9 part 2)", () => {
  it("covers every server action on disk, from the same EXPECTED as the stubbed suite", () => {
    expect(DISCOVERED.filter((file) => !Object.hasOwn(EXPECTED, file))).toEqual([]);
    expect(Object.keys(ACTIONS).length).toBe(Object.values(MODULES).reduce((n, exports) => n + Object.keys(exports).length, 0));
  });

  it("resolves each signed-in test user to its own role through the real session and profile", async () => {
    const { getActor } = await import("@/modules/access");
    for (const role of TEST_ROLES) {
      signInAs(role);
      expect(await getActor(), role).toMatchObject({ ok: true, value: { id: TEST_USERS[role].id, role } });
    }
  });

  it("gives the admin every owner/designer action plus Organizzazione, and account/sales/social no write of a case, client or intro", () => {
    const owner = allowedTo("owner_designer");
    const admin = allowedTo("admin");
    expect(admin.filter((name) => !owner.includes(name)).sort()).toEqual(Object.keys(EXPECTED["src/app/(tool)/organization/actions.ts"].actions).map((n) => `organization.${n}`).sort());
    expect(owner.filter((name) => !admin.includes(name))).toEqual([]);
    const sharerOnly = (name: string) => /^(export|client-export|collections|collection)\./.test(name);
    expect(allowedTo("account_sales_social").filter((name) => !sharerOnly(name))).toEqual([]);
  });

  it.each(TEST_ROLES)("denies 'change permissions or guardrails' to the signed-in %s", async (role) => {
    signInAs(role);
    const { authorize, getActor } = await import("@/modules/access");
    const actor = await getActor();
    if (!actor.ok) throw new Error(actor.error.code);
    expect(authorize(actor.value, "change permissions or guardrails")).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  describe.each(TEST_ROLES)("as %s", (role) => {
    describe("every action EXPECTED denies", () => {
      let before: Record<string, string>;
      beforeAll(async () => {
        before = await snapshot();
      });

      const denied = deniedTo(role);
      if (denied.length === 0) {
        it("(none)", () => expect(OWNERS).toContain(role));
      } else {
        it.each(denied)("%s → 403 FORBIDDEN", async (name) => {
          signInAs(role);
          expect(await action(name)(target())).toMatchObject({ ok: false, status: 403, error: { code: "FORBIDDEN" } });
        });
      }

      it("changed no row: a snapshot of every table is the same before and after", async () => {
        expect(await snapshot()).toEqual(before);
      });
    });

    it.each(allowedTo(role))("%s gets past the policy (with no input: 400, never 401 or 403)", async (name) => {
      signInAs(role);
      const result = await action(name)({});
      expect(result.ok || (result.status !== 401 && result.status !== 403), JSON.stringify(result)).toBe(true);
    });
  });

  describe.each(OWNERS as readonly TestRole[])("as %s, for real on seeded data", (role) => {
    it("creates and edits a client, creates a case, edits a case in review and approves it", async () => {
      signInAs(role);
      const prefix = await freshPrefix(pool);
      const created = await action("clients.createClient")({ name: nameWithLetters(prefix), industry: TEST_INDUSTRY, description: TEST_DESCRIPTION });
      expect(created).toMatchObject({ ok: true });
      const clientId = (created.value as { id: string }).id;
      const logoId = await addTestLogo(pool, clientId, TEST_ACTOR_ID);
      const renamed = nameWithLetters(prefix);
      expect(await action("clients.updateClient")({ clientId, name: renamed, industry: TEST_INDUSTRY, description: TEST_DESCRIPTION, logoId })).toMatchObject({ ok: true });
      expect((await pool.query("select name, created_by from public.client where id = $1", [clientId])).rows[0]).toEqual({ name: renamed, created_by: TEST_USERS[role].id });

      const made = await action("case-studies.createCaseStudy")({ name: `Nuovo ${role}`, clientId, year: 2026, businessLines: ["branding"] });
      expect(made).toMatchObject({ ok: true, value: { status: "draft" } });

      const { caseId, revisionId } = await reviewCase(`Da approvare ${role}`);
      signInAs(role);
      expect(await action("configurator.saveRevisionDoc")({ caseId, revisionId, doc: seed.doc, expectedVersion: 0 })).toEqual({ ok: true, value: { version: 1 } });
      const { FORMAT_IDS } = await import("@/modules/rendering");
      const overflow = Object.fromEntries(FORMAT_IDS.map((id) => [id, false]));
      const approved = await action("configurator.approveCase")({ caseId, revisionId, expectedRevisionVersion: 1, expectedHeadVersion: await headVersion(caseId), overflow });
      expect(approved, JSON.stringify(approved)).toMatchObject({ ok: true });
      expect((await pool.query("select status, approved_revision_id from public.case_study where id = $1", [caseId])).rows[0]).toEqual({ status: "approved", approved_revision_id: revisionId });
      const approver = await pool.query("select actor_id from public.case_event where case_id = $1 and type = 'transition' and data->>'event' = 'approve'", [caseId]);
      expect(approver.rows).toEqual([{ actor_id: TEST_USERS[role].id }]);
    });
  });

  describe("Organizzazione (manage users, admin only)", () => {
    it("opens for the admin, who changes a user's job title", async () => {
      signInAs("admin");
      const { default: UsersPage } = await import("@/app/(tool)/organization/page");
      const { renderToStaticMarkup } = await import("react-dom/server");
      const html = renderToStaticMarkup((await UsersPage())!);
      expect(html).toContain(TEST_USERS.account_sales_social.email);
      expect(await action("organization.changeJobTitle")({ profileId: TEST_USERS.account_sales_social.id, jobTitle: "Account" })).toMatchObject({
        ok: true,
        value: { jobTitle: "Account" },
      });
      expect((await pool.query("select job_title from public.profile where id = $1", [TEST_USERS.account_sales_social.id])).rows[0]).toEqual({ job_title: "Account" });
    });

    it.each(["owner_designer", "account_sales_social"] as const)("sends %s to its landing instead", async (role) => {
      signInAs(role);
      const { default: UsersPage } = await import("@/app/(tool)/organization/page");
      await expect(UsersPage()).rejects.toThrow(/^REDIRECT \//);
    });
  });

  describe("as account_sales_social, for real on seeded data", () => {
    it("exports the approved case: an export job is enqueued, and its status answers", async () => {
      signInAs("account_sales_social");
      const requested = await action("export.requestCaseExport")({ caseId: seed.approvedCaseId, format: F });
      expect(requested, JSON.stringify(requested)).toMatchObject({ ok: true, value: { status: "pending" } });
      const jobId = (requested.value as { jobId: string }).jobId;
      enqueuedJobs.push(jobId);
      expect((await pool.query("select kind, status, subject_id from public.job where id = $1", [jobId])).rows).toEqual([
        { kind: "export", status: "queued", subject_id: seed.approvedCaseId },
      ]);
      expect(await action("export.getCaseExportStatus")({ caseId: seed.approvedCaseId, jobId })).toMatchObject({ ok: true, value: { status: "pending", jobId } });
    });

    it("downloads the client pack: an export job for the client is enqueued", async () => {
      signInAs("account_sales_social");
      const requested = await action("client-export.requestClientExport")({ clientId: seed.client.id, formats: [F] });
      expect(requested, JSON.stringify(requested)).toMatchObject({ ok: true, value: { status: "pending" } });
      const jobId = (requested.value as { jobId: string }).jobId;
      enqueuedJobs.push(jobId);
      expect((await pool.query("select kind, subject_id from public.job where id = $1", [jobId])).rows).toEqual([{ kind: "export", subject_id: seed.client.id }]);
    });

    it("reaches approved cases only: a draft is refused, never read or exported", async () => {
      signInAs("account_sales_social");
      const before = await snapshot();
      for (const name of ["case-studies.listAssets", "case-studies.getDetailsForm", "configurator.getRenderAssets"]) {
        expect(await action(name)({ caseId: seed.draftCaseId, assetIds: [] }), name).toMatchObject({ ok: false, status: 403, error: { code: "FORBIDDEN" } });
      }
      expect(await action("export.requestCaseExport")({ caseId: seed.draftCaseId, format: F })).toMatchObject({ ok: false, error: { code: "NOT_APPROVED" } });
      // The case page never shows a draft to this role: it sends the person elsewhere.
      const { default: CaseViewPage } = await import("@/app/(tool)/case-studies/[caseId]/page");
      await expect(CaseViewPage({ params: Promise.resolve({ caseId: seed.draftCaseId }) })).rejects.toThrow(/^REDIRECT /);
      // The library's list scope is approved only.
      const { getActor } = await import("@/modules/access");
      const { listScopeFor } = await import("@/app/_lib/list-scope");
      const actor = await getActor();
      if (!actor.ok) throw new Error(actor.error.code);
      expect(listScopeFor(actor.value)).toEqual({ status: "approved" });
      expect(await snapshot()).toEqual(before);
    });

    it("lists on Clienti only the clients with an approved case", async () => {
      signInAs("account_sales_social");
      const { default: ClientsPage } = await import("@/app/(tool)/clients/page");
      const { renderToStaticMarkup } = await import("react-dom/server");
      const html = renderToStaticMarkup((await ClientsPage({ searchParams: Promise.resolve({}) }))!);
      expect(html).toContain(seed.client.name);
      expect(html).not.toContain(seed.draftOnlyClient.name);
    });

    it("edits a collection's text: saved, with no revision, case, client or intro row changed", async () => {
      signInAs("account_sales_social");
      const before = await originals(seed.approvedCaseId, seed.client.id);
      const { rows } = await pool.query<{ version: number }>("select version from public.collection where id = $1", [seed.collectionId]);
      const saved = await action("collection.setCollectionText")({
        collectionId: seed.collectionId,
        expectedVersion: rows[0].version,
        part: { kind: "case", id: seed.approvedCaseId },
        formatId: F,
        pageKey: seed.pageKey,
        elementId: seed.elementId,
        text: "Parole della raccolta",
      });
      expect(saved, JSON.stringify(saved)).toMatchObject({ ok: true, value: { version: rows[0].version + 1 } });
      expect((await pool.query("select text, updated_by from public.collection_text_edit where collection_id = $1", [seed.collectionId])).rows).toEqual([
        { text: "Parole della raccolta", updated_by: TEST_USERS.account_sales_social.id },
      ]);
      expect(await originals(seed.approvedCaseId, seed.client.id)).toEqual(before);
    });
  });

  describe("refused before the policy (401)", () => {
    it.each(Object.keys(ACTIONS))("%s with no session", async (name) => {
      switchSession(new TestCookieStore());
      expect(await action(name)(target())).toMatchObject({ ok: false, status: 401 });
    });

    // An account/sales/social user: the test admin is the stack's only enabled admin, which the
    // last-admin rule keeps enabled (part 1 covers a removed admin with the profile stubbed).
    describe("a disabled (removed) account/sales/social user", () => {
      beforeAll(async () => {
        await pool.query("update public.profile set disabled_at = now() where id = $1", [TEST_USERS.account_sales_social.id]);
      });
      afterAll(async () => {
        await pool.query("update public.profile set disabled_at = null where id = $1", [TEST_USERS.account_sales_social.id]);
      });

      it.each(Object.keys(ACTIONS))("%s → 401", async (name) => {
        signInAs("account_sales_social");
        expect(await action(name)(target())).toMatchObject({ ok: false, status: 401 });
      });
    });
  });
});
