import { describe, expect, it, vi } from "vitest";
import type { Actor } from "@/modules/access";
import { CASE_CREATED, TRANSITION, type CaseEvent } from "@/modules/case-study/domain/case-event";
import type { CaseStatus } from "@/shared/case-status";
import type { CaseStudy, Client, ClientRef, ClientSummary } from "@/modules/case-study/domain/case-study";
import { err, ok } from "@/shared/result";
import { makeCreateCaseStudy } from "./create-case-study";
import { makeCreateClient } from "./create-client";
import { makeGetCaseStudy } from "./get-case-study";
import { makeGetClient } from "./get-client";
import { makeListCaseStudies } from "./list-case-studies";
import { makeListClientSummaries } from "./list-client-summaries";
import { makeListClients } from "./list-clients";
import type { CaseStudyRepository } from "@/modules/case-study/ports/case-study-repository";
import type { ClientLogo, ClientRepository } from "@/modules/case-study/ports/client-repository";
import type { LogoImage, LogoStorage, StoredLogo } from "@/modules/case-study/ports/logo-storage";
import { makeConfirmClientLogoUpload } from "./confirm-client-logo-upload";
import { makeGetClientSnapshot } from "./get-client-snapshot";
import { makeRequestClientLogoUpload } from "./request-client-logo-upload";
import { makeUpdateClient } from "./update-client";
import { makeRecordEvent } from "./record-event";
import { makeTransition } from "./transition";

const actor: Actor = {
  id: "00000000-0000-4000-8000-000000000002",
  email: "dev-owner-designer@mac-recap.invalid",
  displayName: "Dev owner/designer",
  role: "owner_designer",
};

const ACME: ClientRef = { id: "cccccccc-0000-4000-8000-000000000001", name: "Acme", code: "ACM" };
const UNKNOWN_CLIENT_ID = "cccccccc-0000-4000-8000-00000000ffff";

/**
 * In-memory CaseStudyRepository: mirrors the DB defaults and the create
 * transaction, including `create_case_study`'s number per (client, year) and its
 * `CLIENT_NOT_FOUND` (the real codes come from SQL only).
 */
function fakeRepository() {
  const cases = new Map<string, CaseStudy>();
  const events: CaseEvent[] = [];
  const clients = new Map<string, ClientRef>([[ACME.id, ACME]]);
  const counters = new Map<string, number>();
  let n = 0;
  const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  const now = "2026-10-09T10:00:00.000000+00:00";

  const repo = {
    create: vi.fn<CaseStudyRepository["create"]>(async ({ clientId, ...input }, actorId) => {
      const client = clients.get(clientId);
      if (client === undefined) return err({ code: "CLIENT_NOT_FOUND", message: "No client with this id." });
      const pair = `${clientId}/${input.year}`;
      const number = (counters.get(pair) ?? 0) + 1;
      counters.set(pair, number);
      const row: CaseStudy = {
        id: uuid(),
        code: `${client.code}-${input.year}-${String(number).padStart(2, "0")}`,
        number,
        client,
        ...input,
        status: "draft",
        projectOrderRef: null,
        headRevisionId: null,
        approvedRevisionId: null,
        headVersion: 0,
        createdBy: actorId,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      cases.set(row.id, row);
      events.push({
        id: uuid(),
        caseId: row.id,
        revisionId: null,
        actorId,
        type: CASE_CREATED,
        at: now,
        // Same payload create_case_study writes.
        data: {
          name: row.name,
          client: client.name,
          clientId: client.id,
          clientCode: client.code,
          code: row.code,
          year: row.year,
          locale: row.locale,
        },
      });
      return ok(row);
    }),
    findById: vi.fn<CaseStudyRepository["findById"]>(async (id) => {
      const row = cases.get(id);
      return ok(row && row.deletedAt === null ? row : null);
    }),
    // Mirrors the adapter query: non-deleted, `status` when scoped, newest updated_at first.
    list: vi.fn<CaseStudyRepository["list"]>(async (scope) =>
      ok(
        [...cases.values()]
          .filter(
            (row) =>
              row.deletedAt === null &&
              (scope.status === undefined || row.status === scope.status) &&
              (scope.clientId === undefined || row.client.id === scope.clientId),
          )
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      ),
    ),
    appendEvent: vi.fn<CaseStudyRepository["appendEvent"]>(async (event) => {
      if (!cases.has(event.caseId)) return ok(null);
      const row: CaseEvent = { id: uuid(), at: now, ...event };
      events.push(row);
      return ok(row);
    }),
    // Mirrors transition_case_study: compare-and-set on a non-deleted row, then one `transition` event.
    transition: vi.fn<CaseStudyRepository["transition"]>(async ({ caseId, event, from, to, actorId }) => {
      const row = cases.get(caseId);
      if (!row || row.deletedAt !== null) return err({ code: "NOT_FOUND", message: "No case study with this id." });
      if (row.status !== from) return err({ code: "STALE_STATUS", message: "Status changed." });
      const moved: CaseStudy = { ...row, status: to };
      cases.set(caseId, moved);
      events.push({ id: uuid(), caseId, revisionId: null, actorId, type: TRANSITION, at: now, data: { event, from, to } });
      return ok(moved);
    }),
  } satisfies CaseStudyRepository;

  return { repo, cases, events, clients };
}

describe("create", () => {
  it("creates a draft case with its code, locale it, created_by the actor and one case_created event", async () => {
    const { repo, events } = fakeRepository();
    const result = await makeCreateCaseStudy(repo)(actor, { name: " Rebrand ", clientId: ACME.id, year: 2026 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      name: "Rebrand",
      client: ACME,
      code: "ACM-2026-01",
      number: 1,
      year: 2026,
      locale: "it",
      status: "draft",
      createdBy: actor.id,
    });
    expect(repo.create).toHaveBeenCalledWith({ name: "Rebrand", clientId: ACME.id, year: 2026, locale: "it" }, actor.id);
    expect(events).toEqual([
      expect.objectContaining({
        caseId: result.value.id,
        type: CASE_CREATED,
        actorId: actor.id,
        data: expect.objectContaining({ clientId: ACME.id, clientCode: "ACM", code: "ACM-2026-01" }),
      }),
    ]);
  });

  it("drops a free-text client and any code the caller sends", async () => {
    const { repo } = fakeRepository();
    await makeCreateCaseStudy(repo)(actor, { name: "R", clientId: ACME.id, client: "Acme", code: "ZZZ-1999-01", year: 2026 });
    expect(repo.create).toHaveBeenCalledWith({ name: "R", clientId: ACME.id, year: 2026, locale: "it" }, actor.id);
  });

  it.each([
    ["empty name", { name: "", clientId: ACME.id, year: 2026 }, ["name"]],
    ["no client picked", { name: "Rebrand", clientId: "", year: 2026 }, ["clientId"]],
    ["a free-text client", { name: "Rebrand", client: "Acme", year: 2026 }, ["clientId"]],
    ["both missing", { year: 2026 }, ["name", "clientId"]],
    ["non-integer year", { name: "R", clientId: ACME.id, year: 2026.1 }, ["year"]],
    ["year out of range", { name: "R", clientId: ACME.id, year: 1850 }, ["year"]],
    ["bad locale", { name: "R", clientId: ACME.id, year: 2026, locale: "de" }, ["locale"]],
  ])("%s → INVALID_INPUT naming the fields; nothing written", async (_label, input, fields) => {
    const { repo, cases, events } = fakeRepository();
    const result = await makeCreateCaseStudy(repo)(actor, input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_INPUT");
      expect((result.error.details as { fields: string[] }).fields).toEqual(fields);
    }
    expect(repo.create).not.toHaveBeenCalled();
    expect(cases.size).toBe(0);
    expect(events).toEqual([]);
  });

  it("an unknown client → CLIENT_NOT_FOUND; nothing written", async () => {
    const { repo, cases, events } = fakeRepository();
    const result = await makeCreateCaseStudy(repo)(actor, { name: "R", clientId: UNKNOWN_CLIENT_ID, year: 2026 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CLIENT_NOT_FOUND");
    expect(cases.size).toBe(0);
    expect(events).toEqual([]);
  });

  it("passes a repository failure through", async () => {
    const failure = err({ code: "CASE_STUDY_WRITE_FAILED", message: "down" });
    const { repo } = fakeRepository();
    repo.create.mockResolvedValueOnce(failure);
    expect(await makeCreateCaseStudy(repo)(actor, { name: "R", clientId: ACME.id, year: 2026 })).toEqual(failure);
  });
});

type StoredClient = Client & { caseCount: number };

/**
 * In-memory ClientRepository: mirrors `create_client` / `update_client` refusals
 * (name key: trimmed, collapsed whitespace, lower-cased, accents stripped; a logo
 * of another client). The real code comes from SQL only; this fake hands out a
 * fixed one. `logos` is append-only like `client_logo`.
 */
function fakeClientRepository(rows: (ClientSummary | StoredClient)[] = []) {
  const clients = new Map<string, StoredClient>(
    rows.map((c) => [c.id, { sector: null, description: null, logoId: null, ...c }]),
  );
  const logos = new Map<string, ClientLogo>();
  /** caseId → clientId for the non-deleted cases `findSnapshotByCaseId` knows. */
  const cases = new Map<string, string>();
  const nameKey = (name: string) =>
    name.trim().replace(/\s+/g, " ").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const view = ({ id, name, code, sector, description, logoId }: StoredClient): Client => ({ id, name, code, sector, description, logoId });
  let n = 0;
  const repo = {
    list: vi.fn<ClientRepository["list"]>(async () => ok([...clients.values()].map(({ id, name, code }) => ({ id, name, code })))),
    listWithCaseCounts: vi.fn<ClientRepository["listWithCaseCounts"]>(async () =>
      ok([...clients.values()].map(({ id, name, code, caseCount }) => ({ id, name, code, caseCount }))),
    ),
    findById: vi.fn<ClientRepository["findById"]>(async (id) => {
      const found = clients.get(id);
      return ok(found ? view(found) : null);
    }),
    create: vi.fn<ClientRepository["create"]>(async (name, info) => {
      if ([...clients.values()].some((c) => nameKey(c.name) === nameKey(name))) {
        return err({ code: "CLIENT_NAME_TAKEN", message: "taken" });
      }
      const client: Client = {
        id: `dddddddd-0000-4000-8000-${String(++n).padStart(12, "0")}`,
        name,
        code: `C${String(n).padStart(2, "0")}`,
        ...info,
        logoId: null,
      };
      clients.set(client.id, { ...client, caseCount: 0 });
      return ok(client);
    }),
    update: vi.fn<ClientRepository["update"]>(async ({ id, name, sector, description, logoId }) => {
      const found = clients.get(id);
      if (!found) return err({ code: "CLIENT_NOT_FOUND", message: "No client with this id." });
      if ([...clients.values()].some((c) => c.id !== id && nameKey(c.name) === nameKey(name))) {
        return err({ code: "CLIENT_NAME_TAKEN", message: "taken" });
      }
      if (logoId !== null && logos.get(logoId)?.clientId !== id) return err({ code: "CLIENT_LOGO_INVALID", message: "foreign" });
      const next = { ...found, name, sector, description, logoId };
      clients.set(id, next);
      return ok(view(next));
    }),
    findLogo: vi.fn<ClientRepository["findLogo"]>(async (id) => ok(logos.get(id) ?? null)),
    insertLogo: vi.fn<ClientRepository["insertLogo"]>(async ({ id, clientId, contentType, sizeBytes }) => {
      const logo = { id, clientId, contentType, sizeBytes };
      if (logos.has(logo.id)) return err({ code: "CLIENT_LOGO_INVALID", message: "already confirmed" });
      logos.set(logo.id, logo);
      return ok(logo);
    }),
    findSnapshotByCaseId: vi.fn<ClientRepository["findSnapshotByCaseId"]>(async (caseId) => {
      const client = clients.get(cases.get(caseId) ?? "");
      if (!client) return ok(null);
      const { id, name, sector, description, logoId } = client;
      return ok({ clientId: id, name, sector, description, logoId });
    }),
  } satisfies ClientRepository;
  return { repo, clients, logos, cases };
}

const LOGO_ID = "eeeeeeee-0000-4000-8000-000000000001";
const OTHER_LOGO_ID = "eeeeeeee-0000-4000-8000-000000000002";
const LUMEN: ClientSummary = { id: "cccccccc-0000-4000-8000-000000000010", name: "Lumen Srl", code: "LUM", caseCount: 2 };
const LUMEN_CLIENT: Client = { id: LUMEN.id, name: LUMEN.name, code: LUMEN.code, sector: null, description: null, logoId: null };

/** In-memory LogoStorage: a stored object per key, as the browser's PUT left it. */
function fakeLogoStorage() {
  const objects = new Map<string, { stored: StoredLogo; image: LogoImage }>();
  const keyOf = (t: { clientId: string; logoId: string }) => `${t.clientId}/${t.logoId}`;
  const storage = {
    presignUpload: vi.fn<LogoStorage["presignUpload"]>(async (t) =>
      ok({ url: `https://storage/${keyOf(t)}`, method: "PUT" as const, headers: { "content-type": t.contentType, "x-upsert": "false" } }),
    ),
    presignDownload: vi.fn<LogoStorage["presignDownload"]>(async (t) => ok(`https://storage/${keyOf(t)}?sig`)),
    head: vi.fn<LogoStorage["head"]>(async (t) => ok(objects.get(keyOf(t))?.stored ?? null)),
    dimensions: vi.fn<LogoStorage["dimensions"]>(async (t) => ok(objects.get(keyOf(t))?.image ?? null)),
  } satisfies LogoStorage;
  const put = (
    clientId: string,
    logoId: string,
    over: { sizeBytes?: number; contentType?: string | null; format?: string | null; width?: number; height?: number } = {},
  ) =>
    objects.set(keyOf({ clientId, logoId }), {
      stored: { sizeBytes: over.sizeBytes ?? 2048, contentType: over.contentType === undefined ? "image/png" : over.contentType },
      image: { format: over.format === undefined ? "png" : over.format, width: over.width ?? 800, height: over.height ?? 400 },
    });
  return { storage, put };
}

describe("createClient", () => {
  it("adds the trimmed name and info with the actor and returns the client", async () => {
    const { repo } = fakeClientRepository();
    const result = await makeCreateClient(repo)(actor, { name: "  Lumen Srl ", code: "ZZZ", sector: " Moda ", description: "  " });
    expect(result.ok).toBe(true);
    expect(repo.create).toHaveBeenCalledExactlyOnceWith("Lumen Srl", { sector: "Moda", description: null }, actor.id);
  });

  it("adds a client with no info as empty fields", async () => {
    const { repo } = fakeClientRepository();
    const result = await makeCreateClient(repo)(actor, { name: "Lumen Srl" });
    expect(result.ok && result.value).toMatchObject({ sector: null, description: null, logoId: null });
  });

  it.each([["   "], ["x".repeat(121)], [undefined]])("rejects the name %j as INVALID_INPUT without writing", async (name) => {
    const { repo } = fakeClientRepository();
    const result = await makeCreateClient(repo)(actor, { name });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ code: "INVALID_INPUT", details: { fields: ["name"] } });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it.each([
    ["description", 401],
    ["sector", 61],
  ] as const)("refuses a %s of %i characters as CLIENT_FIELD_TOO_LONG without writing", async (field, length) => {
    const { repo } = fakeClientRepository();
    const result = await makeCreateClient(repo)(actor, { name: "Lumen", [field]: "é".repeat(length) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ code: "CLIENT_FIELD_TOO_LONG", details: { fields: [field] } });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("accepts 400 emoji as a 400-character description", async () => {
    const { repo } = fakeClientRepository();
    const result = await makeCreateClient(repo)(actor, { name: "Lumen", description: "😀".repeat(400) });
    expect(result.ok).toBe(true);
  });

  it.each(["lumen  srl", "LUMEN SRL", "Lùmen Srl"])("passes CLIENT_NAME_TAKEN through for %j", async (name) => {
    const { repo, clients } = fakeClientRepository([LUMEN]);
    const result = await makeCreateClient(repo)(actor, { name });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CLIENT_NAME_TAKEN");
    expect(clients.size).toBe(1);
  });
});

describe("updateClient", () => {
  const input = (over: Record<string, unknown> = {}) => ({
    clientId: LUMEN.id,
    name: "Lumen Srl",
    sector: null,
    description: null,
    logoId: null,
    ...over,
  });

  it("saves every field with the actor; the code stays", async () => {
    const { repo } = fakeClientRepository([LUMEN]);
    const result = await makeUpdateClient(repo)(actor, input({ name: " Lumen S.r.l. ", sector: "Moda", description: " Brand. " }));
    expect(result).toEqual(ok({ ...LUMEN_CLIENT, name: "Lumen S.r.l.", sector: "Moda", description: "Brand." }));
    expect(repo.update).toHaveBeenCalledExactlyOnceWith(
      { id: LUMEN.id, name: "Lumen S.r.l.", sector: "Moda", description: "Brand.", logoId: null },
      actor.id,
    );
  });

  it.each(["Lumen Srl", "lumen srl"])("allows its own name or a variant (%j)", async (name) => {
    const { repo } = fakeClientRepository([LUMEN]);
    expect(await makeUpdateClient(repo)(actor, input({ name }))).toEqual(ok({ ...LUMEN_CLIENT, name }));
  });

  it("stores blank fields as null", async () => {
    const { repo } = fakeClientRepository([{ ...LUMEN_CLIENT, sector: "Moda", description: "Brand.", caseCount: 0 }]);
    const result = await makeUpdateClient(repo)(actor, input({ sector: "   ", description: "" }));
    expect(result.ok && result.value).toMatchObject({ sector: null, description: null });
  });

  it("links a logo of this client, then clears it; the logo row stays", async () => {
    const { repo, logos } = fakeClientRepository([LUMEN]);
    logos.set(LOGO_ID, { id: LOGO_ID, clientId: LUMEN.id, contentType: "image/png", sizeBytes: 10 });
    expect((await makeUpdateClient(repo)(actor, input({ logoId: LOGO_ID }))).ok).toBe(true);
    const cleared = await makeUpdateClient(repo)(actor, input({ logoId: null }));
    expect(cleared.ok && cleared.value.logoId).toBeNull();
    expect(logos.has(LOGO_ID)).toBe(true);
  });

  it.each([
    ["another client's logo", OTHER_LOGO_ID],
    ["an unknown logo", "eeeeeeee-0000-4000-8000-00000000ffff"],
  ])("refuses %s as CLIENT_LOGO_INVALID", async (_label, logoId) => {
    const { repo, logos } = fakeClientRepository([LUMEN]);
    logos.set(OTHER_LOGO_ID, { id: OTHER_LOGO_ID, clientId: UNKNOWN_CLIENT_ID, contentType: "image/png", sizeBytes: 10 });
    const result = await makeUpdateClient(repo)(actor, input({ logoId }));
    expect(result.ok || result.error.code).toBe("CLIENT_LOGO_INVALID");
  });

  it("rejects a malformed id, a blank name or missing sector, description or logo id as INVALID_INPUT without writing", async () => {
    const { repo } = fakeClientRepository([LUMEN]);
    const result = await makeUpdateClient(repo)(actor, { clientId: "LUM", name: " " });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({ code: "INVALID_INPUT", details: { fields: ["clientId", "name", "sector", "description", "logoId"] } });
    }
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("refuses a 401-character description as CLIENT_FIELD_TOO_LONG without writing", async () => {
    const { repo } = fakeClientRepository([LUMEN]);
    const result = await makeUpdateClient(repo)(actor, input({ description: "x".repeat(401) }));
    expect(result.ok || result.error.code).toBe("CLIENT_FIELD_TOO_LONG");
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("passes CLIENT_NOT_FOUND and CLIENT_NAME_TAKEN through", async () => {
    const other: ClientSummary = { id: "cccccccc-0000-4000-8000-000000000011", name: "Acme", code: "ACM", caseCount: 0 };
    const { repo } = fakeClientRepository([LUMEN, other]);
    const unknown = await makeUpdateClient(repo)(actor, input({ clientId: UNKNOWN_CLIENT_ID, name: "X" }));
    expect(unknown.ok || unknown.error.code).toBe("CLIENT_NOT_FOUND");
    const taken = await makeUpdateClient(repo)(actor, input({ clientId: other.id, name: "LUMEN SRL" }));
    expect(taken.ok || taken.error.code).toBe("CLIENT_NAME_TAKEN");
  });
});

describe("requestClientLogoUpload", () => {
  const deps = () => {
    const clients = fakeClientRepository([LUMEN]);
    const storage = fakeLogoStorage();
    return { ...clients, ...storage, run: makeRequestClientLogoUpload({ clients: clients.repo, storage: storage.storage, newId: () => LOGO_ID }) };
  };

  it("issues a signed PUT for a new logo id of the client", async () => {
    const { run, storage } = deps();
    const result = await run(actor, { clientId: LUMEN.id, contentType: "image/webp", sizeBytes: 5 * 1024 * 1024 });
    expect(result).toEqual(
      ok({ logoId: LOGO_ID, url: `https://storage/${LUMEN.id}/${LOGO_ID}`, method: "PUT", headers: { "content-type": "image/webp", "x-upsert": "false" } }),
    );
    expect(storage.presignUpload).toHaveBeenCalledWith({ clientId: LUMEN.id, logoId: LOGO_ID, contentType: "image/webp" });
  });

  it.each([
    ["an SVG", { contentType: "image/svg+xml", sizeBytes: 10 }],
    ["a GIF", { contentType: "image/gif", sizeBytes: 10 }],
    ["a PDF", { contentType: "application/pdf", sizeBytes: 10 }],
    ["an empty file", { contentType: "image/png", sizeBytes: 0 }],
    ["a file over 5 MB", { contentType: "image/png", sizeBytes: 5 * 1024 * 1024 + 1 }],
  ])("refuses %s as CLIENT_LOGO_INVALID before signing", async (_label, declared) => {
    const { run, storage } = deps();
    const result = await run(actor, { clientId: LUMEN.id, ...declared });
    expect(result.ok || result.error.code).toBe("CLIENT_LOGO_INVALID");
    expect(storage.presignUpload).not.toHaveBeenCalled();
  });

  it("refuses an unknown client as CLIENT_NOT_FOUND", async () => {
    const { run } = deps();
    const result = await run(actor, { clientId: UNKNOWN_CLIENT_ID, contentType: "image/png", sizeBytes: 10 });
    expect(result.ok || result.error.code).toBe("CLIENT_NOT_FOUND");
  });
});

describe("confirmClientLogoUpload", () => {
  const deps = () => {
    const clients = fakeClientRepository([LUMEN]);
    const storage = fakeLogoStorage();
    return { ...clients, ...storage, run: makeConfirmClientLogoUpload({ clients: clients.repo, storage: storage.storage, newId: () => LOGO_ID }) };
  };
  const input = { clientId: LUMEN.id, logoId: LOGO_ID, contentType: "image/png" };

  it("records the logo row after re-checking the stored object, without linking it", async () => {
    const { run, put, logos, clients } = deps();
    put(LUMEN.id, LOGO_ID, { sizeBytes: 4096, width: 400, height: 1200 });
    expect(await run(actor, input)).toEqual(ok({ logoId: LOGO_ID }));
    expect(logos.get(LOGO_ID)).toEqual({ id: LOGO_ID, clientId: LUMEN.id, contentType: "image/png", sizeBytes: 4096 });
    expect(clients.get(LUMEN.id)?.logoId).toBeNull();
  });

  it.each([
    ["no uploaded object", null],
    ["an empty object", { sizeBytes: 0 }],
    ["an object over 5 MB", { sizeBytes: 5 * 1024 * 1024 + 1 }],
    ["a different stored content type", { contentType: "image/gif" }],
    ["bytes of another format", { format: "gif" }],
    ["bytes that are not an image", { format: null }],
    ["a 399 px short side", { width: 1200, height: 399 }],
    ["a side over 8000 px", { width: 8001, height: 400 }],
  ] as const)("refuses %s as CLIENT_LOGO_INVALID and writes no row", async (_label, over) => {
    const { run, put, logos } = deps();
    if (over !== null) put(LUMEN.id, LOGO_ID, over);
    const result = await run(actor, input);
    expect(result.ok || result.error.code).toBe("CLIENT_LOGO_INVALID");
    expect(logos.size).toBe(0);
  });

  it("refuses the same logo id confirmed twice; the first row stands", async () => {
    const { run, put, logos } = deps();
    put(LUMEN.id, LOGO_ID);
    expect(await run(actor, input)).toEqual(ok({ logoId: LOGO_ID }));
    const again = await run(actor, input);
    expect(again.ok || again.error.code).toBe("CLIENT_LOGO_INVALID");
    expect(logos.size).toBe(1);
  });

  it("refuses an SVG content type before reading storage", async () => {
    const { run, storage } = deps();
    const result = await run(actor, { ...input, contentType: "image/svg+xml" });
    expect(result.ok || result.error.code).toBe("CLIENT_LOGO_INVALID");
    expect(storage.head).not.toHaveBeenCalled();
  });

  it("refuses an object uploaded under another client's id", async () => {
    const { run, put, logos } = deps();
    put(UNKNOWN_CLIENT_ID, LOGO_ID);
    const result = await run(actor, input);
    expect(result.ok || result.error.code).toBe("CLIENT_LOGO_INVALID");
    expect(logos.size).toBe(0);
  });
});

describe("getClientSnapshot", () => {
  const CASE_ID = "aaaaaaaa-0000-4000-8000-000000000001";

  it("returns the client's current values for the case", async () => {
    const { repo, cases } = fakeClientRepository([{ ...LUMEN_CLIENT, sector: "Moda", description: "Brand.", logoId: LOGO_ID, caseCount: 1 }]);
    cases.set(CASE_ID, LUMEN.id);
    expect(await makeGetClientSnapshot(repo)(CASE_ID)).toEqual(
      ok({ clientId: LUMEN.id, name: "Lumen Srl", sector: "Moda", description: "Brand.", logoId: LOGO_ID }),
    );
  });

  it.each([["an unknown or deleted case", "aaaaaaaa-0000-4000-8000-00000000ffff"], ["a malformed id", "LUM-2026-01"]])(
    "returns NOT_FOUND for %s",
    async (_label, id) => {
      const { repo } = fakeClientRepository([LUMEN]);
      const result = await makeGetClientSnapshot(repo)(id);
      expect(result.ok || result.error.code).toBe("NOT_FOUND");
    },
  );
});

describe("getClient", () => {
  it("returns a known client without a logo", async () => {
    const { repo } = fakeClientRepository([LUMEN]);
    expect(await makeGetClient(repo, fakeLogoStorage().storage)(LUMEN.id)).toEqual(ok({ ...LUMEN_CLIENT, logoUrl: null }));
  });

  it("signs the current logo for at most 15 minutes", async () => {
    const { repo, logos } = fakeClientRepository([{ ...LUMEN_CLIENT, logoId: LOGO_ID, caseCount: 0 }]);
    logos.set(LOGO_ID, { id: LOGO_ID, clientId: LUMEN.id, contentType: "image/webp", sizeBytes: 10 });
    const { storage } = fakeLogoStorage();
    const result = await makeGetClient(repo, storage)(LUMEN.id);
    expect(result.ok && result.value.logoUrl).toBe(`https://storage/${LUMEN.id}/${LOGO_ID}?sig`);
    const [target, ttl] = storage.presignDownload.mock.calls[0];
    expect(target).toEqual({ clientId: LUMEN.id, logoId: LOGO_ID, contentType: "image/webp" });
    expect(ttl).toBeLessThanOrEqual(15 * 60);
  });

  it.each([
    ["fails", err({ code: "CLIENT_LOOKUP_FAILED", message: "down" })],
    ["finds no row", ok(null)],
  ] as const)("leaves the logo out and warns with the client id when the logo lookup %s", async (_label, answer) => {
    const { repo } = fakeClientRepository([{ ...LUMEN_CLIENT, logoId: LOGO_ID, caseCount: 0 }]);
    repo.findLogo.mockResolvedValueOnce(answer);
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const result = await makeGetClient(repo, fakeLogoStorage().storage)(LUMEN.id);
      expect(result).toEqual(ok({ ...LUMEN_CLIENT, logoId: LOGO_ID, logoUrl: null }));
      expect(JSON.parse(String(write.mock.calls[0][0]))).toMatchObject({ level: "warn", clientId: LUMEN.id });
    } finally {
      write.mockRestore();
    }
  });

  it("leaves the logo out and logs the client id only when signing fails", async () => {
    const { repo, logos } = fakeClientRepository([{ ...LUMEN_CLIENT, logoId: LOGO_ID, caseCount: 0 }]);
    logos.set(LOGO_ID, { id: LOGO_ID, clientId: LUMEN.id, contentType: "image/png", sizeBytes: 10 });
    const { storage } = fakeLogoStorage();
    storage.presignDownload.mockResolvedValueOnce(err({ code: "STORAGE_FAILED", message: "down" }));
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const result = await makeGetClient(repo, storage)(LUMEN.id);
      expect(result).toEqual(ok({ ...LUMEN_CLIENT, logoId: LOGO_ID, logoUrl: null }));
      const entry = JSON.parse(String(write.mock.calls[0][0]));
      expect(entry).toMatchObject({ level: "warn", clientId: LUMEN.id });
      expect(Object.keys(entry).sort()).toEqual(["clientId", "level", "msg", "time"]);
    } finally {
      write.mockRestore();
    }
  });

  it.each([["an unknown id", UNKNOWN_CLIENT_ID], ["a malformed id", "LUM"], ["a non-string", ["a", "b"]]])(
    "returns CLIENT_NOT_FOUND for %s",
    async (_label, id) => {
      const { repo } = fakeClientRepository([LUMEN]);
      const result = await makeGetClient(repo, fakeLogoStorage().storage)(id);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("CLIENT_NOT_FOUND");
    },
  );

  it("does not query for a malformed id", async () => {
    const { repo } = fakeClientRepository([LUMEN]);
    await makeGetClient(repo, fakeLogoStorage().storage)("not-a-uuid");
    expect(repo.findById).not.toHaveBeenCalled();
  });
});

describe("listClientSummaries", () => {
  it("returns every client with its case count, sorted by name, case- and accent-insensitive", async () => {
    const rows: ClientSummary[] = [
      { id: "cccccccc-0000-4000-8000-000000000001", name: "Zeta", code: "ZET", caseCount: 0 },
      { id: "cccccccc-0000-4000-8000-000000000002", name: "città di Torino", code: "CIT", caseCount: 4 },
      { id: "cccccccc-0000-4000-8000-000000000003", name: "Acme", code: "ACM", caseCount: 1 },
    ];
    const result = await makeListClientSummaries(fakeClientRepository(rows).repo)();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.map((c) => [c.code, c.caseCount])).toEqual([["ACM", 1], ["CIT", 4], ["ZET", 0]]);
  });

  it("passes a repository failure through", async () => {
    const failure = err({ code: "CLIENT_LOOKUP_FAILED", message: "down" });
    const { repo } = fakeClientRepository();
    repo.listWithCaseCounts.mockResolvedValueOnce(failure);
    expect(await makeListClientSummaries(repo)()).toEqual(failure);
  });
});

describe("listClients", () => {
  const client = (name: string, code: string, n: number): ClientRef => ({
    id: `cccccccc-0000-4000-8000-${String(n).padStart(12, "0")}`,
    name,
    code,
  });

  function fakeClients(rows: ClientRef[]) {
    return { ...fakeClientRepository().repo, list: vi.fn<ClientRepository["list"]>(async () => ok(rows)) } satisfies ClientRepository;
  }

  it("returns every client sorted by name, case- and accent-insensitive", async () => {
    const rows = [client("Zeta", "ZET", 1), client("città di Torino", "CIT", 2), client("Acme", "ACM", 3), client("Beta", "BET", 4)];
    const result = await makeListClients(fakeClients(rows))();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.map((c) => c.code)).toEqual(["ACM", "BET", "CIT", "ZET"]);
  });

  it("returns an empty list when there are no clients", async () => {
    expect(await makeListClients(fakeClients([]))()).toEqual(ok([]));
  });

  it("passes a repository failure through", async () => {
    const failure = err({ code: "CLIENT_LOOKUP_FAILED", message: "down" });
    const repo = fakeClients([]);
    repo.list.mockResolvedValueOnce(failure);
    expect(await makeListClients(repo)()).toEqual(failure);
  });
});

describe("get", () => {
  it("returns an existing case", async () => {
    const { repo } = fakeRepository();
    const created = await makeCreateCaseStudy(repo)(actor, { name: "R", clientId: ACME.id, year: 2026 });
    if (!created.ok) throw new Error("setup");
    expect(await makeGetCaseStudy(repo)(created.value.id)).toEqual(ok(created.value));
  });

  it("returns NOT_FOUND for an unknown id", async () => {
    const result = await makeGetCaseStudy(fakeRepository().repo)("11111111-1111-4111-8111-111111111111");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });

  it("returns NOT_FOUND for a soft-deleted case", async () => {
    const { repo, cases } = fakeRepository();
    const created = await makeCreateCaseStudy(repo)(actor, { name: "R", clientId: ACME.id, year: 2026 });
    if (!created.ok) throw new Error("setup");
    cases.set(created.value.id, { ...created.value, deletedAt: "2026-10-09T11:00:00Z" });
    const result = await makeGetCaseStudy(repo)(created.value.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });

  it.each(["not-a-uuid", "", undefined, null, 42])("returns NOT_FOUND for %o without querying", async (id) => {
    const { repo } = fakeRepository();
    const result = await makeGetCaseStudy(repo)(id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
    expect(repo.findById).not.toHaveBeenCalled();
  });

  it("passes a repository failure through", async () => {
    const failure = err({ code: "CASE_STUDY_LOOKUP_FAILED", message: "down" });
    const { repo } = fakeRepository();
    repo.findById.mockResolvedValueOnce(failure);
    expect(await makeGetCaseStudy(repo)("11111111-1111-4111-8111-111111111111")).toEqual(failure);
  });
});

describe("list", () => {
  /** A fake repository holding one case per status, plus a soft-deleted draft and a soft-deleted approved case. */
  async function seeded() {
    const fake = fakeRepository();
    const make = async (name: string, status: CaseStatus, updatedAt: string, deletedAt: string | null = null) => {
      const created = await makeCreateCaseStudy(fake.repo)(actor, { name, clientId: ACME.id, year: 2026 });
      if (!created.ok) throw new Error("setup");
      fake.cases.set(created.value.id, { ...created.value, status, updatedAt, deletedAt });
      return created.value.id;
    };
    const ids = {
      draft: await make("Draft", "draft", "2026-10-09T10:00:00Z"),
      generating: await make("Generating", "generating", "2026-10-11T10:00:00Z"),
      inReview: await make("In review", "in_review", "2026-10-10T10:00:00Z"),
      approved: await make("Approved", "approved", "2026-10-12T10:00:00Z"),
      oldApproved: await make("Old approved", "approved", "2026-10-01T10:00:00Z"),
      deletedDraft: await make("Deleted", "draft", "2026-10-13T10:00:00Z", "2026-10-13T11:00:00Z"),
      deletedApproved: await make("Deleted approved", "approved", "2026-10-13T10:00:00Z", "2026-10-13T11:00:00Z"),
    };
    return { ...fake, ids };
  }

  it("lists every non-deleted case for the all-statuses scope, newest updated first", async () => {
    const { repo, ids } = await seeded();
    const result = await makeListCaseStudies(repo)({});
    expect(repo.list).toHaveBeenCalledWith({});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.map((c) => c.id)).toEqual([ids.approved, ids.generating, ids.inReview, ids.draft, ids.oldApproved]);
    }
  });

  it("lists approved cases only for the approved scope, never soft-deleted ones", async () => {
    const { repo, ids } = await seeded();
    const result = await makeListCaseStudies(repo)({ status: "approved" });
    expect(repo.list).toHaveBeenCalledWith({ status: "approved" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.map((c) => c.id)).toEqual([ids.approved, ids.oldApproved]);
  });

  it("returns an empty list when there are no cases", async () => {
    expect(await makeListCaseStudies(fakeRepository().repo)({})).toEqual(ok([]));
  });

  it.each([
    ["an unknown status", { status: "archived" }],
    ["an extra key", { status: "approved", createdBy: actor.id }],
    ["a non-object", "approved"],
    ["undefined", undefined],
  ])("rejects %s as INVALID_INPUT without querying", async (_label, scope) => {
    const { repo } = fakeRepository();
    const result = await makeListCaseStudies(repo)(scope);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_INPUT");
    expect(repo.list).not.toHaveBeenCalled();
  });

  it("passes a repository failure through", async () => {
    const failure = err({ code: "CASE_STUDY_LOOKUP_FAILED", message: "down" });
    const { repo } = fakeRepository();
    repo.list.mockResolvedValueOnce(failure);
    expect(await makeListCaseStudies(repo)({})).toEqual(failure);
  });

  it("limits the list to one client when the scope names it", async () => {
    const { repo, ids, clients } = await seeded();
    const other: ClientRef = { id: "cccccccc-0000-4000-8000-000000000002", name: "Beta", code: "BET" };
    clients.set(other.id, other);
    const created = await makeCreateCaseStudy(repo)(actor, { name: "Other", clientId: other.id, year: 2026 });
    if (!created.ok) throw new Error("setup");
    const result = await makeListCaseStudies(repo)({ clientId: other.id });
    expect(repo.list).toHaveBeenCalledWith({ clientId: other.id });
    expect(result.ok && result.value.map((c) => c.id)).toEqual([created.value.id]);
    const acme = await makeListCaseStudies(repo)({ clientId: ACME.id });
    expect(acme.ok && acme.value.map((c) => c.id)).not.toContain(created.value.id);
    expect(acme.ok && acme.value.map((c) => c.id)).toContain(ids.draft);
  });

  it("rejects a malformed client id as INVALID_INPUT without querying", async () => {
    const { repo } = fakeRepository();
    const result = await makeListCaseStudies(repo)({ clientId: "LUM" });
    expect(result.ok).toBe(false);
    expect(repo.list).not.toHaveBeenCalled();
  });
});

describe("recordEvent", () => {
  it("appends one event with the actor", async () => {
    const { repo, events } = fakeRepository();
    const created = await makeCreateCaseStudy(repo)(actor, { name: "R", clientId: ACME.id, year: 2026 });
    if (!created.ok) throw new Error("setup");
    const result = await makeRecordEvent(repo)(actor, {
      caseId: created.value.id,
      type: "text_added",
      data: { textItemId: "t1" },
    });
    expect(result).toEqual(
      ok(expect.objectContaining({ caseId: created.value.id, actorId: actor.id, type: "text_added", revisionId: null, data: { textItemId: "t1" } })),
    );
    expect(events).toHaveLength(2);
  });

  it("returns NOT_FOUND for an unknown case", async () => {
    const { repo, events } = fakeRepository();
    const result = await makeRecordEvent(repo)(actor, { caseId: "11111111-1111-4111-8111-111111111111", type: "x" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
    expect(events).toEqual([]);
  });

  it("returns INVALID_INPUT without writing for a bad type", async () => {
    const { repo } = fakeRepository();
    const result = await makeRecordEvent(repo)(actor, { caseId: "11111111-1111-4111-8111-111111111111", type: "Bad Type" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_INPUT");
    expect(repo.appendEvent).not.toHaveBeenCalled();
  });
});

describe("transition", () => {
  /** A fake repository holding one case in `status`, with the create event cleared. */
  async function caseIn(status: CaseStatus, deletedAt: string | null = null) {
    const fake = fakeRepository();
    const created = await makeCreateCaseStudy(fake.repo)(actor, { name: "R", clientId: ACME.id, year: 2026 });
    if (!created.ok) throw new Error("setup");
    fake.cases.set(created.value.id, { ...created.value, status, deletedAt });
    fake.events.length = 0;
    return { ...fake, id: created.value.id };
  }

  it.each([
    ["draft", "generate", "generating"],
    ["generating", "generation_succeeded", "in_review"],
    ["generating", "generation_failed", "draft"],
    ["in_review", "approve", "approved"],
  ] as const)("%s --%s--> %s with one transition event", async (from, event, to) => {
    const { repo, events, id } = await caseIn(from);
    const result = await makeTransition(repo)(id, event, actor);
    expect(result).toEqual(ok(expect.objectContaining({ id, status: to })));
    expect(repo.transition).toHaveBeenCalledWith({ caseId: id, event, from, to, actorId: actor.id });
    expect(events).toEqual([
      expect.objectContaining({ caseId: id, actorId: actor.id, type: TRANSITION, data: { event, from, to } }),
    ]);
  });

  it.each([
    ["approve on draft", "draft", "approve"],
    ["generate on generating", "generating", "generate"],
    ["approve on approved", "approved", "approve"],
    ["generate on approved", "approved", "generate"],
    ["an unknown event", "draft", "fork"],
    ["a non-string event", "draft", 7],
  ] as const)("%s → INVALID_TRANSITION; nothing written", async (_label, status, event) => {
    const { repo, events, cases, id } = await caseIn(status);
    const result = await makeTransition(repo)(id, event, actor);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_TRANSITION");
    expect(repo.transition).not.toHaveBeenCalled();
    expect(cases.get(id)?.status).toBe(status);
    expect(events).toEqual([]);
  });

  it("returns STALE_STATUS when the status moved between read and write; nothing written", async () => {
    const { repo, events, cases, id } = await caseIn("draft");
    // Another writer moves the case right after the read.
    repo.findById.mockImplementationOnce(async (caseId) => {
      const read = cases.get(caseId)!;
      cases.set(caseId, { ...read, status: "generating" });
      return ok(read);
    });
    const result = await makeTransition(repo)(id, "generate", actor);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("STALE_STATUS");
    expect(cases.get(id)?.status).toBe("generating");
    expect(events).toEqual([]);
  });

  it("returns NOT_FOUND for a soft-deleted case", async () => {
    const { repo, events, id } = await caseIn("draft", "2026-10-09T11:00:00Z");
    const result = await makeTransition(repo)(id, "generate", actor);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
    expect(repo.transition).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it("returns NOT_FOUND for an unknown id", async () => {
    const { repo } = fakeRepository();
    const result = await makeTransition(repo)("11111111-1111-4111-8111-111111111111", "generate", actor);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
    expect(repo.transition).not.toHaveBeenCalled();
  });

  it.each(["not-a-uuid", "", undefined, 42])("returns NOT_FOUND for %o without querying", async (id) => {
    const { repo } = fakeRepository();
    const result = await makeTransition(repo)(id, "generate", actor);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
    expect(repo.findById).not.toHaveBeenCalled();
  });

  it.each([
    ["the lookup", "findById", err({ code: "CASE_STUDY_LOOKUP_FAILED", message: "down" })],
    ["the write", "transition", err({ code: "CASE_STUDY_WRITE_FAILED", message: "down" })],
  ] as const)("passes a failure of %s through", async (_label, method, failure) => {
    const { repo, id } = await caseIn("draft");
    repo[method].mockResolvedValueOnce(failure);
    expect(await makeTransition(repo)(id, "generate", actor)).toEqual(failure);
  });
});
