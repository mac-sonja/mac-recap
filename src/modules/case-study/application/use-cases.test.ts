import { describe, expect, it, vi } from "vitest";
import type { Actor } from "@/modules/access";
import { CASE_CREATED, CASE_DELETED, CASE_DETAILS_UPDATED, TRANSITION, type CaseEvent } from "@/modules/case-study/domain/case-event";
import type { CaseStatus } from "@/shared/case-status";
import { isClientComplete, type CaseStudy, type Client, type ClientBrief, type ClientRef, type ClientSummary } from "@/modules/case-study/domain/case-study";
import { normalizeClientConfirmName } from "@/shared/client-name";
import { err, ok } from "@/shared/result";
import { makeCreateCaseStudy } from "./create-case-study";
import { makeCreateClient } from "./create-client";
import { makeDeleteCaseStudy } from "./delete-case-study";
import { makeDeleteClient } from "./delete-client";
import { makeGetCaseStudy } from "./get-case-study";
import { LOGO_URL_TTL_SECONDS, makeGetClient } from "./get-client";
import { makeListCaseStudies } from "./list-case-studies";
import { makeListClientSummaries } from "./list-client-summaries";
import { makeListClients } from "./list-clients";
import type { CaseStudyRepository } from "@/modules/case-study/ports/case-study-repository";
import type { ClientLogo, ClientRepository } from "@/modules/case-study/ports/client-repository";
import type { LogoImage, LogoStorage, StoredLogo } from "@/modules/case-study/ports/logo-storage";
import type { ClientMaterialStorage } from "@/modules/case-study/ports/client-material-storage";
import type { ClientAsset } from "@/modules/case-study/domain/client-material";
import { clientMaterialKindFor } from "@/modules/case-study/domain/client-material";
import { makeConfirmClientMaterialUpload } from "./confirm-client-material-upload";
import { makeListClientMaterial } from "./list-client-material";
import { makeRemoveClientMaterial } from "./remove-client-material";
import { makeRequestClientMaterialUpload } from "./request-client-material-upload";
import { makeConfirmClientLogoUpload } from "./confirm-client-logo-upload";
import { makeGetClientInfoForCase } from "./get-client-info-for-case";
import { makeRequestClientLogoUpload } from "./request-client-logo-upload";
import { makeUpdateClient } from "./update-client";
import { makeRecordEvent } from "./record-event";
import { makeSaveClientBriefField, makeSaveClientResults, makeSaveClientTestimonial } from "./save-client-brief-field";
import { makeTransition } from "./transition";
import { makeUpdateCaseStudyDetails } from "./update-case-study-details";

const actor: Actor = {
  id: "00000000-0000-4000-8000-000000000002",
  email: "dev-owner-designer@mac-recap.invalid",
  displayName: "Dev owner/designer",
  role: "owner_designer",
};

const ACME: ClientRef = { id: "cccccccc-0000-4000-8000-000000000001", name: "Acme", code: "ACM" };
const UNKNOWN_CLIENT_ID = "cccccccc-0000-4000-8000-00000000ffff";
const LUMEN_REF: ClientRef = { id: "cccccccc-0000-4000-8000-000000000002", name: "Lumen", code: "LUM" };

/**
 * In-memory CaseStudyRepository: mirrors the DB defaults and the create
 * transaction, including `create_case_study`'s number per (client, year) and its
 * `CLIENT_NOT_FOUND` (the real codes come from SQL only).
 */
function fakeRepository() {
  const cases = new Map<string, CaseStudy>();
  const events: CaseEvent[] = [];
  const clients = new Map<string, ClientRef>([
    [ACME.id, ACME],
    [LUMEN_REF.id, LUMEN_REF],
  ]);
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
          businessLines: row.businessLines,
        },
      });
      return ok(row);
    }),
    // Mirrors update_case_study_details: a non-deleted draft; an unchanged save writes nothing.
    updateDetails: vi.fn<CaseStudyRepository["updateDetails"]>(async ({ caseId, clientId, ...fields }, actorId) => {
      const row = cases.get(caseId);
      if (!row || row.deletedAt !== null) return err({ code: "NOT_FOUND", message: "No case study with this id." });
      if (row.status !== "draft") return err({ code: "STALE_STATUS", message: "No longer a draft." });
      const same =
        row.name === fields.name &&
        row.client.id === clientId &&
        row.year === fields.year &&
        row.locale === fields.locale &&
        row.businessLines.join() === fields.businessLines.join();
      if (same) return ok(row);
      const client = clients.get(clientId);
      if (client === undefined) return err({ code: "CLIENT_NOT_FOUND", message: "No client with this id." });
      // A client or year change takes the next number for (client, year), as create does.
      let { number, code } = row;
      if (clientId !== row.client.id || fields.year !== row.year) {
        const pair = `${clientId}/${fields.year}`;
        number = (counters.get(pair) ?? 0) + 1;
        counters.set(pair, number);
        code = `${client.code}-${fields.year}-${String(number).padStart(2, "0")}`;
      }
      const updated: CaseStudy = { ...row, ...fields, client, number, code };
      cases.set(caseId, updated);
      events.push({ id: uuid(), caseId, revisionId: null, actorId, type: CASE_DETAILS_UPDATED, at: now, data: { ...fields } });
      return ok(updated);
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
    // Mirrors delete_case_study: a non-deleted draft gets deleted_at and one `case_deleted` event.
    softDelete: vi.fn<CaseStudyRepository["softDelete"]>(async (caseId, actorId) => {
      const row = cases.get(caseId);
      if (!row || row.deletedAt !== null) return err({ code: "NOT_FOUND", message: "No case study with this id." });
      if (row.status !== "draft") return err({ code: "CASE_NOT_DELETABLE", message: "Only a draft can be deleted." });
      cases.set(caseId, { ...row, deletedAt: now });
      events.push({
        id: uuid(),
        caseId,
        revisionId: null,
        actorId,
        type: CASE_DELETED,
        at: now,
        data: { reason: "draft_deleted", clientId: row.client.id, code: row.code, status: row.status },
      });
      return ok(undefined);
    }),
  } satisfies CaseStudyRepository;

  return { repo, cases, events, clients };
}

describe("create", () => {
  it("creates a draft case with its code, locale it, created_by the actor and one case_created event", async () => {
    const { repo, events } = fakeRepository();
    const result = await makeCreateCaseStudy(repo)(actor, { name: " Rebrand ", clientId: ACME.id, year: 2026, businessLines: ["branding"] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      name: "Rebrand",
      client: ACME,
      code: "ACM-2026-01",
      number: 1,
      year: 2026,
      locale: "it",
      businessLines: ["branding"],
      status: "draft",
      createdBy: actor.id,
    });
    expect(repo.create).toHaveBeenCalledWith({ name: "Rebrand", clientId: ACME.id, year: 2026, locale: "it", businessLines: ["branding"] }, actor.id);
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
    await makeCreateCaseStudy(repo)(actor, { name: "R", clientId: ACME.id, client: "Acme", code: "ZZZ-1999-01", year: 2026, businessLines: ["branding"] });
    expect(repo.create).toHaveBeenCalledWith({ name: "R", clientId: ACME.id, year: 2026, locale: "it", businessLines: ["branding"] }, actor.id);
  });

  const BL = { businessLines: ["video"] };
  it.each([
    ["empty name", { name: "", clientId: ACME.id, year: 2026, ...BL }, ["name"]],
    ["no client picked", { name: "Rebrand", clientId: "", year: 2026, ...BL }, ["clientId"]],
    ["a free-text client", { name: "Rebrand", client: "Acme", year: 2026, ...BL }, ["clientId"]],
    ["both missing", { year: 2026, ...BL }, ["name", "clientId"]],
    ["non-integer year", { name: "R", clientId: ACME.id, year: 2026.1, ...BL }, ["year"]],
    ["year out of range", { name: "R", clientId: ACME.id, year: 1850, ...BL }, ["year"]],
    ["bad locale", { name: "R", clientId: ACME.id, year: 2026, locale: "de", ...BL }, ["locale"]],
    ["an unknown business line", { name: "R", clientId: ACME.id, year: 2026, businessLines: ["moda"] }, ["businessLines"]],
    ["a business line label", { name: "R", clientId: ACME.id, year: 2026, businessLines: ["Social media"] }, ["businessLines"]],
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
    const result = await makeCreateCaseStudy(repo)(actor, { name: "R", clientId: UNKNOWN_CLIENT_ID, year: 2026, businessLines: ["branding"] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CLIENT_NOT_FOUND");
    expect(cases.size).toBe(0);
    expect(events).toEqual([]);
  });

  it("passes a repository failure through", async () => {
    const failure = err({ code: "CASE_STUDY_WRITE_FAILED", message: "down" });
    const { repo } = fakeRepository();
    repo.create.mockResolvedValueOnce(failure);
    expect(await makeCreateCaseStudy(repo)(actor, { name: "R", clientId: ACME.id, year: 2026, businessLines: ["branding"] })).toEqual(failure);
  });
});

describe("updateDetails", () => {
  async function seeded() {
    const fake = fakeRepository();
    const created = await makeCreateCaseStudy(fake.repo)(actor, { name: "Rebrand", clientId: ACME.id, year: 2026, businessLines: ["branding"] });
    if (!created.ok) throw new Error("setup");
    fake.events.length = 0;
    return { ...fake, created: created.value };
  }

  it("saves trimmed name, year, locale and business line, renumbers on the year change, drops unknown keys, and records case_details_updated", async () => {
    const { repo, events, created } = await seeded();
    const result = await makeUpdateCaseStudyDetails(repo)(actor, {
      caseId: created.id,
      name: " Rebrand 2 ",
      clientId: ACME.id,
      year: 2025,
      locale: "en",
      businessLines: ["social_media"],
      code: "ZZZ-1999-01",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(repo.updateDetails).toHaveBeenCalledExactlyOnceWith(
      { caseId: created.id, name: "Rebrand 2", clientId: ACME.id, year: 2025, locale: "en", businessLines: ["social_media"] },
      actor.id,
    );
    expect(result.value).toMatchObject({ name: "Rebrand 2", year: 2025, locale: "en", businessLines: ["social_media"], client: ACME, code: "ACM-2025-01" });
    expect(events).toEqual([expect.objectContaining({ caseId: created.id, type: CASE_DETAILS_UPDATED, actorId: actor.id })]);
  });

  it("passes a year change through; the repository renumbers the draft", async () => {
    const { repo, created } = await seeded();
    const result = await makeUpdateCaseStudyDetails(repo)(actor, { caseId: created.id, name: "Rebrand", clientId: ACME.id, year: 2025, locale: "it", businessLines: ["branding"] });
    expect(result.ok && [result.value.code, result.value.number]).toEqual(["ACM-2025-01", 1]);
  });

  it("passes a client change through; the code follows the new client (owner, 2026-10-21)", async () => {
    const { repo, created } = await seeded();
    const result = await makeUpdateCaseStudyDetails(repo)(actor, { caseId: created.id, name: "Rebrand", clientId: LUMEN_REF.id, year: 2026, locale: "it", businessLines: ["branding"] });
    expect(result.ok && [result.value.client.id, result.value.code]).toEqual([LUMEN_REF.id, "LUM-2026-01"]);
  });

  it("an unknown client → CLIENT_NOT_FOUND; nothing written", async () => {
    const { repo, events, created } = await seeded();
    const result = await makeUpdateCaseStudyDetails(repo)(actor, { caseId: created.id, name: "Rebrand", clientId: UNKNOWN_CLIENT_ID, year: 2026, locale: "it", businessLines: ["branding"] });
    expect(result.ok ? null : result.error.code).toBe("CLIENT_NOT_FOUND");
    expect(events).toEqual([]);
  });

  it("writes nothing when every field is unchanged", async () => {
    const { repo, events, created } = await seeded();
    const result = await makeUpdateCaseStudyDetails(repo)(actor, { caseId: created.id, name: "Rebrand", clientId: ACME.id, year: 2026, locale: "it", businessLines: ["branding"] });
    expect(result).toEqual(ok(created));
    expect(events).toEqual([]);
  });

  it.each([
    ["no business line", { name: "R", year: 2026, locale: "it" }, ["businessLines"]],
    ["an unknown business line", { name: "R", year: 2026, locale: "it", businessLines: ["moda"] }, ["businessLines"]],
    ["empty name", { name: " ", year: 2026, locale: "it", businessLines: ["video"] }, ["name"]],
    ["no locale", { name: "R", year: 2026, businessLines: ["video"] }, ["locale"]],
    ["year out of range", { name: "R", year: 2101, locale: "it", businessLines: ["video"] }, ["year"]],
  ])("%s → INVALID_INPUT naming the fields; nothing written", async (_label, input, fields) => {
    const { repo, events, created } = await seeded();
    const result = await makeUpdateCaseStudyDetails(repo)(actor, { caseId: created.id, clientId: ACME.id, ...input });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_INPUT");
      expect((result.error.details as { fields: string[] }).fields).toEqual(fields);
    }
    expect(repo.updateDetails).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it("a malformed case id → INVALID_INPUT; an unknown one → NOT_FOUND; a non-draft → STALE_STATUS", async () => {
    const { repo, cases, created } = await seeded();
    const fields = { name: "R", clientId: ACME.id, year: 2026, locale: "it", businessLines: ["video"] };
    const malformed = await makeUpdateCaseStudyDetails(repo)(actor, { caseId: "nope", ...fields });
    expect(malformed.ok ? null : malformed.error.code).toBe("INVALID_INPUT");
    const unknown = await makeUpdateCaseStudyDetails(repo)(actor, { caseId: "11111111-1111-4111-8111-111111111111", ...fields });
    expect(unknown.ok ? null : unknown.error.code).toBe("NOT_FOUND");
    cases.set(created.id, { ...created, status: "in_review" });
    const stale = await makeUpdateCaseStudyDetails(repo)(actor, { caseId: created.id, ...fields });
    expect(stale.ok ? null : stale.error.code).toBe("STALE_STATUS");
  });
});

type StoredClient = Client & { caseCount: number; brief: ClientBrief };
type ClientSeed = ClientRef & { caseCount: number } & Partial<StoredClient>;

const EMPTY_BRIEF: ClientBrief = { context: "", solution: "", results: [], testimonialQuote: "", testimonialAuthor: "" };
const FULL_BRIEF: ClientBrief = {
  context: "C",
  solution: "S",
  results: [{ label: "Candidature ricevute", value: "+180%" }],
  testimonialQuote: "Ci hanno capiti.",
  testimonialAuthor: "Ada Rossi, CEO",
};

/**
 * In-memory ClientRepository: mirrors `create_client` / `update_client` /
 * `save_client_brief_field` refusals (name key: trimmed, collapsed whitespace,
 * lower-cased, accents stripped; a logo of another client; a logo still shown can't
 * be deleted). The real code comes from SQL only; this fake hands out a fixed one.
 */
function fakeClientRepository(rows: ClientSeed[] = []) {
  const clients = new Map<string, StoredClient>(
    rows.map((c) => [c.id, { industry: null, description: null, logoId: null, brief: { ...EMPTY_BRIEF }, ...c }]),
  );
  const logos = new Map<string, ClientLogo>();
  /** client_asset rows by id. */
  const assets = new Map<string, ClientAsset>();
  /** caseId → clientId for the non-deleted cases `findClientInfoByCaseId` knows. */
  const cases = new Map<string, string>();
  const nameKey = (name: string) =>
    name.trim().replace(/\s+/g, " ").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const view = ({ id, name, code, industry, description, logoId }: StoredClient): Client => ({ id, name, code, industry, description, logoId });
  let n = 0;
  const repo = {
    list: vi.fn<ClientRepository["list"]>(async () => ok([...clients.values()].map(({ id, name, code }) => ({ id, name, code })))),
    listWithCaseCounts: vi.fn<ClientRepository["listWithCaseCounts"]>(async () =>
      ok(
        [...clients.values()].map((c) => {
          const logo = c.logoId === null ? undefined : logos.get(c.logoId);
          return {
            id: c.id,
            name: c.name,
            code: c.code,
            caseCount: c.caseCount,
            complete: isClientComplete(c, c.brief),
            logo: logo === undefined ? null : { id: logo.id, contentType: logo.contentType },
          };
        }),
      ),
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
      clients.set(client.id, { ...client, caseCount: 0, brief: { ...EMPTY_BRIEF } });
      return ok(client);
    }),
    update: vi.fn<ClientRepository["update"]>(async ({ id, name, industry, description, logoId }) => {
      const found = clients.get(id);
      if (!found) return err({ code: "CLIENT_NOT_FOUND", message: "No client with this id." });
      if ([...clients.values()].some((c) => c.id !== id && nameKey(c.name) === nameKey(name))) {
        return err({ code: "CLIENT_NAME_TAKEN", message: "taken" });
      }
      if (logos.get(logoId)?.clientId !== id) return err({ code: "CLIENT_LOGO_INVALID", message: "foreign" });
      const next = { ...found, name, industry, description, logoId };
      clients.set(id, next);
      return ok(view(next));
    }),
    // Mirrors delete_client: CLIENT_NOT_FOUND, the name check after trimming and collapsing
    // whitespace; a deleted client leaves every read (here: the map).
    deleteClient: vi.fn<ClientRepository["deleteClient"]>(async (clientId, confirmName) => {
      const found = clients.get(clientId);
      if (!found) return err({ code: "CLIENT_NOT_FOUND", message: "No client with this id." });
      if (normalizeClientConfirmName(confirmName) !== found.name) {
        return err({ code: "CLIENT_DELETE_NAME_MISMATCH", message: "mismatch" });
      }
      clients.delete(clientId);
      return ok(found.caseCount);
    }),
    findBrief: vi.fn<ClientRepository["findBrief"]>(async (clientId) => ok({ ...(clients.get(clientId)?.brief ?? EMPTY_BRIEF) })),
    saveBriefField: vi.fn<ClientRepository["saveBriefField"]>(async (clientId, field, text) => {
      const found = clients.get(clientId);
      if (!found) return err({ code: "CLIENT_NOT_FOUND", message: "No client with this id." });
      const previous = found.brief[field];
      found.brief = { ...found.brief, [field]: text };
      return ok(previous);
    }),
    saveResults: vi.fn<ClientRepository["saveResults"]>(async (clientId, results) => {
      const found = clients.get(clientId);
      if (!found) return err({ code: "CLIENT_NOT_FOUND", message: "No client with this id." });
      const changed = JSON.stringify(found.brief.results) !== JSON.stringify(results);
      found.brief = { ...found.brief, results: [...results] };
      return ok(changed);
    }),
    saveTestimonial: vi.fn<ClientRepository["saveTestimonial"]>(async (clientId, quote, author) => {
      const found = clients.get(clientId);
      if (!found) return err({ code: "CLIENT_NOT_FOUND", message: "No client with this id." });
      const changed = found.brief.testimonialQuote !== quote || found.brief.testimonialAuthor !== author;
      found.brief = { ...found.brief, testimonialQuote: quote, testimonialAuthor: author };
      return ok(changed);
    }),
    findLogo: vi.fn<ClientRepository["findLogo"]>(async (id) => ok(logos.get(id) ?? null)),
    insertLogo: vi.fn<ClientRepository["insertLogo"]>(async ({ id, clientId, contentType, sizeBytes }) => {
      const logo = { id, clientId, contentType, sizeBytes };
      if (logos.has(logo.id)) return err({ code: "CLIENT_LOGO_INVALID", message: "already confirmed" });
      logos.set(logo.id, logo);
      return ok(logo);
    }),
    deleteLogo: vi.fn<ClientRepository["deleteLogo"]>(async (id) => {
      if ([...clients.values()].some((c) => c.logoId === id)) return err({ code: "CLIENT_LOGO_IN_USE", message: "in use" });
      return ok(logos.delete(id));
    }),
    listAssets: vi.fn<ClientRepository["listAssets"]>(async (clientId) =>
      ok([...assets.values()].filter((a) => a.clientId === clientId).sort((a, b) => a.position - b.position)),
    ),
    // Mirrors insert_client_asset: ASSET_ALREADY_CONFIRMED, CLIENT_NOT_FOUND, the lowest free position, CLIENT_MATERIAL_LIMIT.
    insertAsset: vi.fn<ClientRepository["insertAsset"]>(async ({ id, clientId, fileName, contentType, sizeBytes, width, height }) => {
      if (assets.has(id)) return err({ code: "ASSET_ALREADY_CONFIRMED", message: "already confirmed" });
      if (!clients.has(clientId)) return err({ code: "CLIENT_NOT_FOUND", message: "No client with this id." });
      const taken = new Set([...assets.values()].filter((a) => a.clientId === clientId).map((a) => a.position));
      const position = [1, 2, 3].find((p) => !taken.has(p));
      if (position === undefined) return err({ code: "CLIENT_MATERIAL_LIMIT", message: "3 files" });
      const asset: ClientAsset = {
        id,
        clientId,
        position,
        fileName,
        kind: clientMaterialKindFor(contentType),
        contentType,
        sizeBytes,
        width,
        height,
        createdAt: "2026-10-19T10:00:00+00:00",
      };
      assets.set(id, asset);
      return ok(asset);
    }),
    deleteAsset: vi.fn<ClientRepository["deleteAsset"]>(async (id) => ok(assets.delete(id))),
    findClientInfoByCaseId: vi.fn<ClientRepository["findClientInfoByCaseId"]>(async (caseId) => {
      const client = clients.get(cases.get(caseId) ?? "");
      if (!client) return ok(null);
      const { id, name, industry, description, logoId, brief } = client;
      // The sector's label as the table holds it (here: the key's own text).
      return ok({ clientId: id, name, industry: industry === null ? null : { key: industry, label: industry }, description, logoId, brief: { ...brief } });
    }),
  } satisfies ClientRepository;
  return { repo, clients, logos, cases, assets };
}

const LOGO_ID = "eeeeeeee-0000-4000-8000-000000000001";
const OTHER_LOGO_ID = "eeeeeeee-0000-4000-8000-000000000002";
const LUMEN: Omit<ClientSummary, "logoUrl"> = { id: "cccccccc-0000-4000-8000-000000000010", name: "Lumen Srl", code: "LUM", caseCount: 2, complete: false };
const LUMEN_CLIENT: Client = { id: LUMEN.id, name: LUMEN.name, code: LUMEN.code, industry: null, description: null, logoId: null };
const INFO = { industry: "lusso", description: "Brand." };

/** In-memory LogoStorage: a stored object per key, as the browser's PUT left it. */
function fakeLogoStorage() {
  const objects = new Map<string, { stored: StoredLogo; image: LogoImage; bytes?: Uint8Array }>();
  const keyOf = (t: { clientId: string; logoId: string }) => `${t.clientId}/${t.logoId}`;
  const storage = {
    presignUpload: vi.fn<LogoStorage["presignUpload"]>(async (t) =>
      ok({ url: `https://storage/${keyOf(t)}`, method: "PUT" as const, headers: { "content-type": t.contentType, "x-upsert": "false" } }),
    ),
    presignDownload: vi.fn<LogoStorage["presignDownload"]>(async (t) => ok(`https://storage/${keyOf(t)}?sig`)),
    presignDownloads: vi.fn<LogoStorage["presignDownloads"]>(async (targets) => ok(targets.map((t) => `https://storage/${keyOf(t)}?sig`))),
    head: vi.fn<LogoStorage["head"]>(async (t) => ok(objects.get(keyOf(t))?.stored ?? null)),
    read: vi.fn<LogoStorage["read"]>(async (t) => {
      const found = objects.get(keyOf(t));
      return ok(found === undefined ? null : (found.bytes ?? new Uint8Array(found.stored.sizeBytes)));
    }),
    dimensions: vi.fn<LogoStorage["dimensions"]>(async (t) => ok(objects.get(keyOf(t))?.image ?? null)),
    remove: vi.fn<LogoStorage["remove"]>(async (t) => {
      objects.delete(keyOf(t));
      return ok(undefined);
    }),
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
  /** Stores an SVG body as uploaded with the SVG content type and its real size. */
  const putSvg = (clientId: string, logoId: string, text: string, over: { sizeBytes?: number } = {}) => {
    const bytes = new TextEncoder().encode(text);
    objects.set(keyOf({ clientId, logoId }), {
      stored: { sizeBytes: over.sizeBytes ?? bytes.byteLength, contentType: "image/svg+xml" },
      image: { format: null, width: 0, height: 0 },
      bytes,
    });
  };
  return { storage, put, putSvg, objects, keyOf };
}

/** In-memory ClientMaterialStorage: a stored object per key, as the browser's PUT left it. */
function fakeMaterialStorage() {
  const objects = new Map<string, { stored: StoredLogo; image: LogoImage }>();
  const keyOf = (t: { clientId: string; assetId: string }) => `${t.clientId}/${t.assetId}`;
  const storage = {
    presignUpload: vi.fn<ClientMaterialStorage["presignUpload"]>(async (t) =>
      ok({ url: `https://storage/${keyOf(t)}`, method: "PUT" as const, headers: { "content-type": t.contentType, "x-upsert": "false" } }),
    ),
    presignDownloads: vi.fn<ClientMaterialStorage["presignDownloads"]>(async (targets) => ok(targets.map((t) => `https://storage/${keyOf(t)}?sig`))),
    head: vi.fn<ClientMaterialStorage["head"]>(async (t) => ok(objects.get(keyOf(t))?.stored ?? null)),
    dimensions: vi.fn<ClientMaterialStorage["dimensions"]>(async (t) => ok(objects.get(keyOf(t))?.image ?? null)),
    remove: vi.fn<ClientMaterialStorage["remove"]>(async (t) => {
      objects.delete(keyOf(t));
      return ok(undefined);
    }),
  } satisfies ClientMaterialStorage;
  const put = (
    clientId: string,
    assetId: string,
    over: { sizeBytes?: number; contentType?: string | null; format?: string | null; width?: number; height?: number } = {},
  ) =>
    objects.set(keyOf({ clientId, assetId }), {
      stored: { sizeBytes: over.sizeBytes ?? 2048, contentType: over.contentType === undefined ? "image/jpeg" : over.contentType },
      image: { format: over.format === undefined ? "jpeg" : over.format, width: over.width ?? 2400, height: over.height ?? 1600 },
    });
  return { storage, put, objects, keyOf };
}

describe("createClient", () => {
  it("adds the trimmed name, the one sector and the description with the actor", async () => {
    const { repo } = fakeClientRepository();
    const result = await makeCreateClient(repo)(actor, {
      name: "  Lumen Srl ",
      code: "ZZZ",
      industry: "interior_design",
      description: " Brand. ",
    });
    expect(result.ok && result.value).toMatchObject({ industry: "interior_design", description: "Brand.", logoId: null });
    expect(repo.create).toHaveBeenCalledExactlyOnceWith(
      "Lumen Srl",
      { industry: "interior_design", description: "Brand." },
      actor.id,
    );
  });

  it.each([["   "], ["x".repeat(121)], [undefined]])("rejects the name %j as INVALID_INPUT without writing", async (name) => {
    const { repo } = fakeClientRepository();
    const result = await makeCreateClient(repo)(actor, { name, ...INFO });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ code: "INVALID_INPUT", details: { fields: ["name"] } });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it.each([
    ["a malformed sector key", { industry: "Moda" }, "industry"],
    ["several sectors", { industry: ["lusso", "energia"] }, "industry"],
    ["no sector", { industry: null }, "industry"],
    ["a blank description", { description: "  " }, "description"],
    ["no description", { description: undefined }, "description"],
  ])("refuses %s as CLIENT_FIELD_INVALID without writing", async (_label, over, field) => {
    const { repo } = fakeClientRepository();
    const result = await makeCreateClient(repo)(actor, { name: "Lumen", ...INFO, ...over });
    expect(result.ok || result.error).toMatchObject({ code: "CLIENT_FIELD_INVALID", details: { fields: [field] } });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("refuses a 401-character description as CLIENT_FIELD_TOO_LONG without writing", async () => {
    const { repo } = fakeClientRepository();
    const result = await makeCreateClient(repo)(actor, { name: "Lumen", ...INFO, description: "é".repeat(401) });
    expect(result.ok || result.error).toMatchObject({ code: "CLIENT_FIELD_TOO_LONG", details: { fields: ["description"] } });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("accepts 400 emoji as a 400-character description", async () => {
    const { repo } = fakeClientRepository();
    const result = await makeCreateClient(repo)(actor, { name: "Lumen", ...INFO, description: "😀".repeat(400) });
    expect(result.ok).toBe(true);
  });

  it.each(["lumen  srl", "LUMEN SRL", "Lùmen Srl"])("passes CLIENT_NAME_TAKEN through for %j", async (name) => {
    const { repo, clients } = fakeClientRepository([LUMEN]);
    const result = await makeCreateClient(repo)(actor, { name, ...INFO });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CLIENT_NAME_TAKEN");
    expect(clients.size).toBe(1);
  });
});

describe("updateClient", () => {
  const input = (over: Record<string, unknown> = {}) => ({
    clientId: LUMEN.id,
    name: "Lumen Srl",
    ...INFO,
    logoId: LOGO_ID,
    ...over,
  });
  /** Lumen with `logoId` as its current, confirmed logo. */
  const withLogo = (logoId = LOGO_ID) => {
    const fake = fakeClientRepository([{ ...LUMEN, logoId }]);
    fake.logos.set(logoId, { id: logoId, clientId: LUMEN.id, contentType: "image/png", sizeBytes: 10 });
    return fake;
  };

  it("saves every field with the actor; the code stays", async () => {
    const { repo } = withLogo();
    const result = await makeUpdateClient(repo, fakeLogoStorage().storage)(
      actor,
      input({ name: " Lumen S.r.l. ", industry: "energia", description: " Brand. " }),
    );
    expect(result).toEqual(ok({ ...LUMEN_CLIENT, name: "Lumen S.r.l.", industry: "energia", description: "Brand.", logoId: LOGO_ID }));
    expect(repo.update).toHaveBeenCalledExactlyOnceWith(
      { id: LUMEN.id, name: "Lumen S.r.l.", industry: "energia", description: "Brand.", logoId: LOGO_ID },
      actor.id,
    );
  });

  it.each(["Lumen Srl", "lumen srl"])("allows its own name or a variant (%j)", async (name) => {
    const { repo } = withLogo();
    const result = await makeUpdateClient(repo, fakeLogoStorage().storage)(actor, input({ name }));
    expect(result.ok && result.value.name).toBe(name);
  });

  it("replacing the logo deletes the old row and object once the client points at the new one", async () => {
    const { repo, logos, clients } = withLogo(OTHER_LOGO_ID);
    const { storage, put, objects } = fakeLogoStorage();
    logos.set(LOGO_ID, { id: LOGO_ID, clientId: LUMEN.id, contentType: "image/png", sizeBytes: 10 });
    put(LUMEN.id, OTHER_LOGO_ID);
    put(LUMEN.id, LOGO_ID);
    const result = await makeUpdateClient(repo, storage)(actor, input({ logoId: LOGO_ID }));
    expect(result.ok && result.value.logoId).toBe(LOGO_ID);
    expect(clients.get(LUMEN.id)?.logoId).toBe(LOGO_ID);
    expect(repo.deleteLogo).toHaveBeenCalledExactlyOnceWith(OTHER_LOGO_ID);
    expect(storage.remove).toHaveBeenCalledExactlyOnceWith({ clientId: LUMEN.id, logoId: OTHER_LOGO_ID, contentType: "image/png" });
    expect([...logos.keys()]).toEqual([LOGO_ID]);
    expect(objects.size).toBe(1);
    // The delete runs only after the client row stopped pointing at the old logo.
    expect(repo.update.mock.invocationCallOrder[0]).toBeLessThan(repo.deleteLogo.mock.invocationCallOrder[0]);
  });

  it("refuses to clear the logo as CLIENT_FIELD_INVALID without writing", async () => {
    const { repo, logos } = withLogo();
    const { storage } = fakeLogoStorage();
    const result = await makeUpdateClient(repo, storage)(actor, input({ logoId: null }));
    expect(result.ok || result.error).toMatchObject({ code: "CLIENT_FIELD_INVALID", details: { fields: ["logoId"] } });
    expect(repo.update).not.toHaveBeenCalled();
    expect(logos.size).toBe(1);
  });

  it("keeping the same logo deletes nothing", async () => {
    const { repo } = withLogo();
    const { storage } = fakeLogoStorage();
    expect((await makeUpdateClient(repo, storage)(actor, input({ industry: "energia" }))).ok).toBe(true);
    expect(repo.deleteLogo).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it.each([
    ["the file delete fails", "remove"],
    ["the row delete fails", "deleteLogo"],
  ] as const)("still saves when %s, and warns with the client id only", async (_label, failing) => {
    const { repo, logos } = withLogo(OTHER_LOGO_ID);
    logos.set(LOGO_ID, { id: LOGO_ID, clientId: LUMEN.id, contentType: "image/png", sizeBytes: 10 });
    const { storage } = fakeLogoStorage();
    if (failing === "remove") storage.remove.mockResolvedValueOnce(err({ code: "STORAGE_FAILED", message: "down" }));
    else repo.deleteLogo.mockResolvedValueOnce(err({ code: "CLIENT_WRITE_FAILED", message: "down" }));
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const result = await makeUpdateClient(repo, storage)(actor, input({ logoId: LOGO_ID }));
      expect(result.ok && result.value.logoId).toBe(LOGO_ID);
      const entry = JSON.parse(String(write.mock.calls[0][0]));
      expect(entry).toMatchObject({ level: "warn", clientId: LUMEN.id });
      expect(Object.keys(entry).sort()).toEqual(["clientId", "level", "msg", "time"]);
    } finally {
      write.mockRestore();
    }
    if (failing === "deleteLogo") expect(storage.remove).not.toHaveBeenCalled();
  });

  it("deletes nothing when the save is refused", async () => {
    const { repo, logos } = withLogo();
    const { storage } = fakeLogoStorage();
    const result = await makeUpdateClient(repo, storage)(actor, input({ logoId: "eeeeeeee-0000-4000-8000-00000000ffff" }));
    expect(result.ok || result.error.code).toBe("CLIENT_LOGO_INVALID");
    expect(logos.has(LOGO_ID)).toBe(true);
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it.each([
    ["another client's logo", OTHER_LOGO_ID],
    ["an unknown logo", "eeeeeeee-0000-4000-8000-00000000ffff"],
  ])("refuses %s as CLIENT_LOGO_INVALID", async (_label, logoId) => {
    const { repo, logos } = fakeClientRepository([LUMEN]);
    logos.set(OTHER_LOGO_ID, { id: OTHER_LOGO_ID, clientId: UNKNOWN_CLIENT_ID, contentType: "image/png", sizeBytes: 10 });
    const result = await makeUpdateClient(repo, fakeLogoStorage().storage)(actor, input({ logoId }));
    expect(result.ok || result.error.code).toBe("CLIENT_LOGO_INVALID");
  });

  it("rejects a malformed id or a blank name as INVALID_INPUT without writing", async () => {
    const { repo } = fakeClientRepository([LUMEN]);
    const result = await makeUpdateClient(repo, fakeLogoStorage().storage)(actor, { clientId: "LUM", name: " " });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({ code: "INVALID_INPUT", details: { fields: ["industry", "description", "clientId", "name", "logoId"] } });
    }
    expect(repo.update).not.toHaveBeenCalled();
  });

  it.each([
    ["a malformed sector key", { industry: "Moda" }, "industry"],
    ["no sector", { industry: null }, "industry"],
    ["a blank description", { description: "" }, "description"],
  ])("refuses %s as CLIENT_FIELD_INVALID without writing", async (_label, over, field) => {
    const { repo } = withLogo();
    const result = await makeUpdateClient(repo, fakeLogoStorage().storage)(actor, input(over));
    expect(result.ok || result.error).toMatchObject({ code: "CLIENT_FIELD_INVALID", details: { fields: [field] } });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("refuses a 401-character description as CLIENT_FIELD_TOO_LONG without writing", async () => {
    const { repo } = withLogo();
    const result = await makeUpdateClient(repo, fakeLogoStorage().storage)(actor, input({ description: "x".repeat(401) }));
    expect(result.ok || result.error.code).toBe("CLIENT_FIELD_TOO_LONG");
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("passes CLIENT_NOT_FOUND and CLIENT_NAME_TAKEN through", async () => {
    const other: ClientSeed = { id: "cccccccc-0000-4000-8000-000000000011", name: "Acme", code: "ACM", caseCount: 0, logoId: OTHER_LOGO_ID };
    const { repo, logos } = fakeClientRepository([LUMEN, other]);
    logos.set(OTHER_LOGO_ID, { id: OTHER_LOGO_ID, clientId: other.id, contentType: "image/png", sizeBytes: 10 });
    const unknown = await makeUpdateClient(repo, fakeLogoStorage().storage)(actor, input({ clientId: UNKNOWN_CLIENT_ID, name: "X" }));
    expect(unknown.ok || unknown.error.code).toBe("CLIENT_NOT_FOUND");
    const taken = await makeUpdateClient(repo, fakeLogoStorage().storage)(actor, input({ clientId: other.id, name: "LUMEN SRL", logoId: OTHER_LOGO_ID }));
    expect(taken.ok || taken.error.code).toBe("CLIENT_NAME_TAKEN");
  });
});

describe("saveClientBriefField", () => {
  it("saves one field with the actor and returns it; the text is kept as given", async () => {
    const { repo, clients } = fakeClientRepository([LUMEN]);
    const result = await makeSaveClientBriefField(repo)(actor, { clientId: LUMEN.id, field: "solution", text: " Un nuovo marchio. " });
    expect(result).toEqual(ok({ field: "solution", text: " Un nuovo marchio. " }));
    expect(repo.saveBriefField).toHaveBeenCalledExactlyOnceWith(LUMEN.id, "solution", " Un nuovo marchio. ", actor.id);
    expect(clients.get(LUMEN.id)?.brief).toEqual({ ...EMPTY_BRIEF, solution: " Un nuovo marchio. " });
  });

  it("allows an empty text (a field cleared while editing)", async () => {
    const { repo } = fakeClientRepository([{ ...LUMEN, brief: { ...FULL_BRIEF } }]);
    expect((await makeSaveClientBriefField(repo)(actor, { clientId: LUMEN.id, field: "context", text: "" })).ok).toBe(true);
  });

  it("refuses an unknown field as UNKNOWN_FIELD and a text over 5000 characters after trimming as CLIENT_FIELD_TOO_LONG naming it", async () => {
    const { repo } = fakeClientRepository([LUMEN]);
    const unknown = await makeSaveClientBriefField(repo)(actor, { clientId: LUMEN.id, field: "sector", text: "x" });
    expect(unknown.ok || unknown.error.code).toBe("UNKNOWN_FIELD");
    // The old free-text results is no brief text any more.
    const results = await makeSaveClientBriefField(repo)(actor, { clientId: LUMEN.id, field: "results", text: "Più clienti." });
    expect(results.ok || results.error.code).toBe("UNKNOWN_FIELD");
    const atLimit = await makeSaveClientBriefField(repo)(actor, { clientId: LUMEN.id, field: "solution", text: ` ${"😀".repeat(5000)} ` });
    expect(atLimit.ok).toBe(true);
    const over = await makeSaveClientBriefField(repo)(actor, { clientId: LUMEN.id, field: "solution", text: "x".repeat(5001) });
    expect(over.ok || over.error).toMatchObject({ code: "CLIENT_FIELD_TOO_LONG", details: { fields: ["solution"] } });
    expect(repo.saveBriefField).toHaveBeenCalledTimes(1);
  });

  it("refuses a malformed client id as INVALID_INPUT and passes CLIENT_NOT_FOUND through", async () => {
    const { repo } = fakeClientRepository([LUMEN]);
    const malformed = await makeSaveClientBriefField(repo)(actor, { clientId: "LUM", field: "context", text: "x" });
    expect(malformed.ok || malformed.error.code).toBe("INVALID_INPUT");
    const unknown = await makeSaveClientBriefField(repo)(actor, { clientId: UNKNOWN_CLIENT_ID, field: "context", text: "x" });
    expect(unknown.ok || unknown.error.code).toBe("CLIENT_NOT_FOUND");
  });
});

describe("saveClientResults", () => {
  it("saves the filled rows in order, trimmed, with the actor; [] clears them", async () => {
    const { repo, clients } = fakeClientRepository([LUMEN]);
    const results = [
      { label: " Candidature ricevute ", value: "+180%" },
      { label: "Follower su LinkedIn", value: " +35% " },
    ];
    const trimmed = [
      { label: "Candidature ricevute", value: "+180%" },
      { label: "Follower su LinkedIn", value: "+35%" },
    ];
    expect(await makeSaveClientResults(repo)(actor, { clientId: LUMEN.id, results })).toEqual(ok({ results: trimmed }));
    expect(repo.saveResults).toHaveBeenCalledExactlyOnceWith(LUMEN.id, trimmed, actor.id);
    expect(clients.get(LUMEN.id)?.brief.results).toEqual(trimmed);
    expect(await makeSaveClientResults(repo)(actor, { clientId: LUMEN.id, results: [] })).toEqual(ok({ results: [] }));
    expect(clients.get(LUMEN.id)?.brief.results).toEqual([]);
  });

  it("refuses a half row, a value over 20 characters or a 4th row; nothing is written", async () => {
    const { repo } = fakeClientRepository([LUMEN]);
    const half = await makeSaveClientResults(repo)(actor, { clientId: LUMEN.id, results: [{ label: "Visite", value: "" }] });
    expect(half.ok || half.error).toMatchObject({ code: "CLIENT_FIELD_INVALID", details: { fields: ["results"] } });
    const long = await makeSaveClientResults(repo)(actor, { clientId: LUMEN.id, results: [{ label: "Visite", value: "x".repeat(21) }] });
    expect(long.ok || long.error).toMatchObject({ code: "CLIENT_FIELD_TOO_LONG", details: { fields: ["results"] } });
    const row = { label: "Visite", value: "1" };
    const many = await makeSaveClientResults(repo)(actor, { clientId: LUMEN.id, results: [row, row, row, row] });
    expect(many.ok || many.error.code).toBe("CLIENT_FIELD_INVALID");
    expect(repo.saveResults).not.toHaveBeenCalled();
  });

  it("passes CLIENT_NOT_FOUND through", async () => {
    const { repo } = fakeClientRepository([LUMEN]);
    const unknown = await makeSaveClientResults(repo)(actor, { clientId: UNKNOWN_CLIENT_ID, results: [] });
    expect(unknown.ok || unknown.error.code).toBe("CLIENT_NOT_FOUND");
  });
});

describe("saveClientTestimonial", () => {
  it("saves a quote with or without its author, trimmed", async () => {
    const { repo, clients } = fakeClientRepository([LUMEN]);
    expect(await makeSaveClientTestimonial(repo)(actor, { clientId: LUMEN.id, quote: " Ci hanno capiti. ", author: "" })).toEqual(
      ok({ quote: "Ci hanno capiti.", author: "" }),
    );
    expect(repo.saveTestimonial).toHaveBeenCalledExactlyOnceWith(LUMEN.id, "Ci hanno capiti.", "", actor.id);
    await makeSaveClientTestimonial(repo)(actor, { clientId: LUMEN.id, quote: "Ci hanno capiti.", author: "Ada Rossi, CEO" });
    expect(clients.get(LUMEN.id)?.brief).toMatchObject({ testimonialQuote: "Ci hanno capiti.", testimonialAuthor: "Ada Rossi, CEO" });
  });

  it("refuses an author without a quote and texts over their limits; nothing is written", async () => {
    const { repo } = fakeClientRepository([LUMEN]);
    const lone = await makeSaveClientTestimonial(repo)(actor, { clientId: LUMEN.id, quote: " ", author: "Ada Rossi" });
    expect(lone.ok || lone.error).toMatchObject({ code: "CLIENT_FIELD_INVALID", details: { fields: ["quote"] } });
    const long = await makeSaveClientTestimonial(repo)(actor, { clientId: LUMEN.id, quote: "x".repeat(601), author: "" });
    expect(long.ok || long.error).toMatchObject({ code: "CLIENT_FIELD_TOO_LONG", details: { fields: ["quote"] } });
    expect(repo.saveTestimonial).not.toHaveBeenCalled();
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

  it("issues a signed PUT for an SVG logo (the scan runs at confirm)", async () => {
    const { run, storage } = deps();
    const result = await run(actor, { clientId: LUMEN.id, contentType: "image/svg+xml", sizeBytes: 3 * 1024 });
    expect(result.ok).toBe(true);
    expect(storage.presignUpload).toHaveBeenCalledWith({ clientId: LUMEN.id, logoId: LOGO_ID, contentType: "image/svg+xml" });
  });

  it.each([
    ["a 6 MB SVG", { contentType: "image/svg+xml", sizeBytes: 6 * 1024 * 1024 }],
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

  it("refuses a GIF content type before reading storage", async () => {
    const { run, storage } = deps();
    const result = await run(actor, { ...input, contentType: "image/gif" });
    expect(result.ok || result.error.code).toBe("CLIENT_LOGO_INVALID");
    expect(storage.head).not.toHaveBeenCalled();
  });

  describe("an SVG logo", () => {
    const svgInput = { ...input, contentType: "image/svg+xml" };
    const CLEAN = '<svg xmlns="http://www.w3.org/2000/svg" width="10" viewBox="0 0 10 10"><defs><linearGradient id="g"/></defs><use href="#a"/><path id="a" d="M0 0h10v10z" fill="url(#g)"/></svg>';

    it("records a clean SVG after the safety scan, with no pixel check (10 px wide)", async () => {
      const { run, putSvg, logos, storage } = deps();
      putSvg(LUMEN.id, LOGO_ID, CLEAN);
      expect(await run(actor, svgInput)).toEqual(ok({ logoId: LOGO_ID }));
      expect(logos.get(LOGO_ID)).toEqual({ id: LOGO_ID, clientId: LUMEN.id, contentType: "image/svg+xml", sizeBytes: new TextEncoder().encode(CLEAN).byteLength });
      expect(storage.read).toHaveBeenCalledWith({ clientId: LUMEN.id, logoId: LOGO_ID, contentType: "image/svg+xml" });
      expect(storage.dimensions).not.toHaveBeenCalled();
    });

    it.each([
      ["a script", '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
      ["an event handler", '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect ONclick="x"/></svg>'],
      ["an external href", '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.example/x.png"/></svg>'],
      ["an obfuscated javascript:", '<svg xmlns="http://www.w3.org/2000/svg"><a href="&#106;avascript:alert(1)"/></svg>'],
    ])("refuses an SVG with %s as CLIENT_LOGO_INVALID, reason unsafe_svg, and writes no row", async (_label, text) => {
      const { run, putSvg, logos } = deps();
      putSvg(LUMEN.id, LOGO_ID, text);
      const result = await run(actor, svgInput);
      expect(result.ok || result.error).toMatchObject({ code: "CLIENT_LOGO_INVALID", details: { reason: "unsafe_svg" } });
      expect(logos.size).toBe(0);
    });

    it.each([
      ["HTML", "<!doctype html><html><body>x</body></html>"],
      ["no closing </svg>", '<svg xmlns="http://www.w3.org/2000/svg"><rect/>'],
    ])("refuses a .svg holding %s as CLIENT_LOGO_INVALID without the unsafe reason", async (_label, text) => {
      const { run, putSvg, logos } = deps();
      putSvg(LUMEN.id, LOGO_ID, text);
      const result = await run(actor, svgInput);
      expect(result.ok || result.error.code).toBe("CLIENT_LOGO_INVALID");
      expect(result.ok || (result.error.details as { reason?: string }).reason).toBeUndefined();
      expect(logos.size).toBe(0);
    });

    it("refuses PNG bytes stored as an SVG (not UTF-8)", async () => {
      const { run, objects, keyOf, logos } = deps();
      const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      objects.set(keyOf({ clientId: LUMEN.id, logoId: LOGO_ID }), {
        stored: { sizeBytes: bytes.byteLength, contentType: "image/svg+xml" },
        image: { format: "png", width: 800, height: 400 },
        bytes,
      });
      const result = await run(actor, svgInput);
      expect(result.ok || result.error.code).toBe("CLIENT_LOGO_INVALID");
      expect(result.ok || (result.error.details as { reason?: string }).reason).toBeUndefined();
      expect(logos.size).toBe(0);
    });

    it("refuses an SVG declared but stored as another type, or a stored object over 5 MB", async () => {
      const typed = deps();
      typed.put(LUMEN.id, LOGO_ID, { contentType: "image/png" });
      expect((await typed.run(actor, svgInput)).ok).toBe(false);
      const big = deps();
      big.putSvg(LUMEN.id, LOGO_ID, CLEAN, { sizeBytes: 6 * 1024 * 1024 });
      const result = await big.run(actor, svgInput);
      expect(result.ok || result.error.code).toBe("CLIENT_LOGO_INVALID");
      expect(big.storage.read).not.toHaveBeenCalled();
      expect(big.logos.size).toBe(0);
    });

    it("refuses an SVG whose object vanished between head and read", async () => {
      const { run, putSvg, storage, logos } = deps();
      putSvg(LUMEN.id, LOGO_ID, CLEAN);
      storage.read.mockResolvedValueOnce(ok(null));
      const result = await run(actor, svgInput);
      expect(result.ok || result.error.code).toBe("CLIENT_LOGO_INVALID");
      expect(logos.size).toBe(0);
    });

    it("passes a failed read through as STORAGE_FAILED", async () => {
      const { run, putSvg, storage } = deps();
      putSvg(LUMEN.id, LOGO_ID, CLEAN);
      storage.read.mockResolvedValueOnce(err({ code: "STORAGE_FAILED", message: "down" }));
      const result = await run(actor, svgInput);
      expect(result.ok || result.error.code).toBe("STORAGE_FAILED");
    });
  });

  it("refuses an object uploaded under another client's id", async () => {
    const { run, put, logos } = deps();
    put(UNKNOWN_CLIENT_ID, LOGO_ID);
    const result = await run(actor, input);
    expect(result.ok || result.error.code).toBe("CLIENT_LOGO_INVALID");
    expect(logos.size).toBe(0);
  });
});

describe("getClientInfoForCase", () => {
  const CASE_ID = "aaaaaaaa-0000-4000-8000-000000000001";

  it("returns the client's current values for the case", async () => {
    const { repo, cases } = fakeClientRepository([
      { ...LUMEN, industry: "energia", description: "Brand.", logoId: LOGO_ID, brief: { ...FULL_BRIEF } },
    ]);
    cases.set(CASE_ID, LUMEN.id);
    expect(await makeGetClientInfoForCase(repo)(CASE_ID)).toEqual(
      ok({
        clientId: LUMEN.id,
        name: "Lumen Srl",
        industry: { key: "energia", label: "energia" },
        description: "Brand.",
        logoId: LOGO_ID,
        brief: FULL_BRIEF,
      }),
    );
  });

  it.each([["an unknown or deleted case", "aaaaaaaa-0000-4000-8000-00000000ffff"], ["a malformed id", "LUM-2026-01"]])(
    "returns NOT_FOUND for %s",
    async (_label, id) => {
      const { repo } = fakeClientRepository([LUMEN]);
      const result = await makeGetClientInfoForCase(repo)(id);
      expect(result.ok || result.error.code).toBe("NOT_FOUND");
    },
  );
});

describe("getClient", () => {
  it("returns a known client with its brief and without a logo", async () => {
    const { repo } = fakeClientRepository([{ ...LUMEN, brief: { ...FULL_BRIEF } }]);
    expect(await makeGetClient(repo, fakeLogoStorage().storage)(LUMEN.id)).toEqual(ok({ ...LUMEN_CLIENT, brief: FULL_BRIEF, logoUrl: null }));
  });

  it("passes a failed brief read through", async () => {
    const failure = err({ code: "CLIENT_LOOKUP_FAILED", message: "down" });
    const { repo } = fakeClientRepository([LUMEN]);
    repo.findBrief.mockResolvedValueOnce(failure);
    expect(await makeGetClient(repo, fakeLogoStorage().storage)(LUMEN.id)).toEqual(failure);
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
      expect(result).toEqual(ok({ ...LUMEN_CLIENT, logoId: LOGO_ID, brief: EMPTY_BRIEF, logoUrl: null }));
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
      expect(result).toEqual(ok({ ...LUMEN_CLIENT, logoId: LOGO_ID, brief: EMPTY_BRIEF, logoUrl: null }));
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
    const rows: ClientSeed[] = [
      { id: "cccccccc-0000-4000-8000-000000000001", name: "Zeta", code: "ZET", caseCount: 0 },
      { id: "cccccccc-0000-4000-8000-000000000002", name: "città di Torino", code: "CIT", caseCount: 4 },
      { id: "cccccccc-0000-4000-8000-000000000003", name: "Acme", code: "ACM", caseCount: 1 },
    ];
    const { storage } = fakeLogoStorage();
    const result = await makeListClientSummaries(fakeClientRepository(rows).repo, storage)();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.map((c) => [c.code, c.caseCount, c.logoUrl])).toEqual([["ACM", 1, null], ["CIT", 4, null], ["ZET", 0, null]]);
    // No logo to sign: no storage call.
    expect(storage.presignDownloads).not.toHaveBeenCalled();
  });

  /** Lumen and Acme with a logo each (Acme's an SVG), Zeta without. */
  async function withLogos() {
    const acme = { id: "cccccccc-0000-4000-8000-000000000003", name: "Acme", code: "ACM", caseCount: 1, logoId: OTHER_LOGO_ID };
    const zeta = { id: "cccccccc-0000-4000-8000-000000000001", name: "Zeta", code: "ZET", caseCount: 0 };
    const fake = fakeClientRepository([{ ...LUMEN, logoId: LOGO_ID }, acme, zeta]);
    await fake.repo.insertLogo({ id: LOGO_ID, clientId: LUMEN.id, contentType: "image/png", sizeBytes: 2048, createdBy: actor.id });
    await fake.repo.insertLogo({ id: OTHER_LOGO_ID, clientId: acme.id, contentType: "image/svg+xml", sizeBytes: 900, createdBy: actor.id });
    return { repo: fake.repo, acme, zeta, ...fakeLogoStorage() };
  }

  it("signs every client's current logo in one storage call within the logo TTL; a client without a logo gets null", async () => {
    const { repo, acme, zeta, storage, keyOf } = await withLogos();
    const result = await makeListClientSummaries(repo, storage)();
    expect(storage.presignDownloads).toHaveBeenCalledTimes(1);
    const [targets, ttl] = storage.presignDownloads.mock.calls[0];
    expect(ttl).toBe(LOGO_URL_TTL_SECONDS);
    expect(ttl).toBeLessThanOrEqual(15 * 60);
    expect(targets).toEqual([
      { clientId: LUMEN.id, logoId: LOGO_ID, contentType: "image/png" },
      { clientId: acme.id, logoId: OTHER_LOGO_ID, contentType: "image/svg+xml" },
    ]);
    expect(storage.presignDownload).not.toHaveBeenCalled();
    expect(result).toEqual(
      ok([
        { id: acme.id, name: "Acme", code: "ACM", caseCount: 1, complete: false, logoUrl: `https://storage/${keyOf({ clientId: acme.id, logoId: OTHER_LOGO_ID })}?sig` },
        { ...LUMEN, logoUrl: `https://storage/${keyOf({ clientId: LUMEN.id, logoId: LOGO_ID })}?sig` },
        { id: zeta.id, name: "Zeta", code: "ZET", caseCount: 0, complete: false, logoUrl: null },
      ]),
    );
  });

  it("an unsigned logo gets null and a warning with the client id only, never failing the list", async () => {
    const { repo, acme, storage } = await withLogos();
    storage.presignDownloads.mockResolvedValueOnce(ok(["https://storage/lumen?sig", null]));
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const result = await makeListClientSummaries(repo, storage)();
      expect(result.ok && result.value.map((c) => [c.code, c.logoUrl])).toEqual([["ACM", null], ["LUM", "https://storage/lumen?sig"], ["ZET", null]]);
      const lines = write.mock.calls.map(([line]) => JSON.parse(String(line)));
      expect(lines).toEqual([expect.objectContaining({ level: "warn", msg: "client logo could not be signed", clientId: acme.id })]);
      expect(Object.keys(lines[0]).sort()).toEqual(["clientId", "level", "msg", "time"]);
    } finally {
      write.mockRestore();
    }
  });

  it("a failed signing call leaves every logoUrl null, warns per client and still lists", async () => {
    const { repo, acme, storage } = await withLogos();
    storage.presignDownloads.mockResolvedValueOnce(err({ code: "STORAGE_FAILED", message: "down" }));
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const result = await makeListClientSummaries(repo, storage)();
      expect(result.ok && result.value.map((c) => [c.code, c.logoUrl])).toEqual([["ACM", null], ["LUM", null], ["ZET", null]]);
      const lines = write.mock.calls.map(([line]) => JSON.parse(String(line)));
      expect(lines.map((l) => [l.level, l.clientId])).toEqual([
        ["warn", LUMEN.id],
        ["warn", acme.id],
      ]);
    } finally {
      write.mockRestore();
    }
  });

  it("passes a repository failure through", async () => {
    const failure = err({ code: "CLIENT_LOOKUP_FAILED", message: "down" });
    const { repo } = fakeClientRepository();
    repo.listWithCaseCounts.mockResolvedValueOnce(failure);
    expect(await makeListClientSummaries(repo, fakeLogoStorage().storage)()).toEqual(failure);
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
    const created = await makeCreateCaseStudy(repo)(actor, { name: "R", clientId: ACME.id, year: 2026, businessLines: ["branding"] });
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
    const created = await makeCreateCaseStudy(repo)(actor, { name: "R", clientId: ACME.id, year: 2026, businessLines: ["branding"] });
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
      const created = await makeCreateCaseStudy(fake.repo)(actor, { name, clientId: ACME.id, year: 2026, businessLines: ["branding"] });
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
    const created = await makeCreateCaseStudy(repo)(actor, { name: "Other", clientId: other.id, year: 2026, businessLines: ["branding"] });
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
    const created = await makeCreateCaseStudy(repo)(actor, { name: "R", clientId: ACME.id, year: 2026, businessLines: ["branding"] });
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

describe("deleteCaseStudy", () => {
  /** A fake repository holding one case in `status`, with the create event cleared. */
  async function caseIn(status: CaseStatus) {
    const fake = fakeRepository();
    const created = await makeCreateCaseStudy(fake.repo)(actor, { name: "R", clientId: ACME.id, year: 2026, businessLines: ["branding"] });
    if (!created.ok) throw new Error("setup");
    fake.cases.set(created.value.id, { ...created.value, status });
    fake.events.length = 0;
    return { ...fake, id: created.value.id };
  }

  it("soft-deletes a draft with one case_deleted event; it then leaves every read and list", async () => {
    const { repo, events, cases, id } = await caseIn("draft");
    const result = await makeDeleteCaseStudy(repo)(actor, { caseId: id, name: "ignored" });
    expect(result).toEqual(ok(undefined));
    expect(repo.softDelete).toHaveBeenCalledExactlyOnceWith(id, actor.id);
    expect(cases.get(id)?.deletedAt).not.toBeNull();
    expect(events).toEqual([
      expect.objectContaining({ caseId: id, actorId: actor.id, type: CASE_DELETED, data: expect.objectContaining({ reason: "draft_deleted" }) }),
    ]);
    expect(await makeGetCaseStudy(repo)(id)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    const listed = await makeListCaseStudies(repo)({});
    expect(listed.ok && listed.value.map((c) => c.id)).toEqual([]);
  });

  it.each(["generating", "in_review", "approved"] as const)("refuses a case in %s with CASE_NOT_DELETABLE; nothing written", async (status) => {
    const { repo, events, cases, id } = await caseIn(status);
    const result = await makeDeleteCaseStudy(repo)(actor, { caseId: id });
    expect(result.ok || result.error.code).toBe("CASE_NOT_DELETABLE");
    expect(cases.get(id)?.deletedAt).toBeNull();
    expect(events).toEqual([]);
  });

  it("answers NOT_FOUND for an unknown or already deleted case", async () => {
    const { repo, id } = await caseIn("draft");
    const run = makeDeleteCaseStudy(repo);
    expect(await run(actor, { caseId: id })).toEqual(ok(undefined));
    const again = await run(actor, { caseId: id });
    expect(again.ok || again.error.code).toBe("NOT_FOUND");
    const unknown = await run(actor, { caseId: UNKNOWN_CLIENT_ID });
    expect(unknown.ok || unknown.error.code).toBe("NOT_FOUND");
  });

  it.each([
    ["a malformed id", { caseId: "nope" }],
    ["no id", {}],
    ["no input", null],
  ])("returns INVALID_INPUT for %s and never calls the repository", async (_label, input) => {
    const { repo } = await caseIn("draft");
    const result = await makeDeleteCaseStudy(repo)(actor, input);
    expect(result.ok || result.error.code).toBe("INVALID_INPUT");
    expect(repo.softDelete).not.toHaveBeenCalled();
  });
});

describe("transition", () => {
  /** A fake repository holding one case in `status`, with the create event cleared. */
  async function caseIn(status: CaseStatus, deletedAt: string | null = null) {
    const fake = fakeRepository();
    const created = await makeCreateCaseStudy(fake.repo)(actor, { name: "R", clientId: ACME.id, year: 2026, businessLines: ["branding"] });
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

const ASSET_ID = "ffffffff-0000-4000-8000-000000000001";
const MB = 1024 * 1024;

/** Seeds one stored client file row directly. */
function seedAsset(assets: Map<string, ClientAsset>, n: number, over: Partial<ClientAsset> = {}): ClientAsset {
  const asset: ClientAsset = {
    id: `ffffffff-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`,
    clientId: LUMEN.id,
    position: n,
    fileName: `foto-${n}.jpg`,
    kind: "image",
    contentType: "image/jpeg",
    sizeBytes: 2048,
    width: 2400,
    height: 1600,
    createdAt: "2026-10-19T10:00:00+00:00",
    ...over,
  };
  assets.set(asset.id, asset);
  return asset;
}

describe("requestClientMaterialUpload", () => {
  const deps = () => {
    const clients = fakeClientRepository([LUMEN]);
    const storage = fakeMaterialStorage();
    return { ...clients, ...storage, run: makeRequestClientMaterialUpload({ clients: clients.repo, storage: storage.storage, newId: () => ASSET_ID }) };
  };

  it("issues a signed PUT for a new asset id without writing anything", async () => {
    const { run, storage, assets } = deps();
    const result = await run(actor, { clientId: LUMEN.id, contentType: "application/pdf", sizeBytes: 10 * MB });
    expect(result).toEqual(
      ok({ assetId: ASSET_ID, url: `https://storage/${LUMEN.id}/${ASSET_ID}`, method: "PUT", headers: { "content-type": "application/pdf", "x-upsert": "false" } }),
    );
    expect(storage.presignUpload).toHaveBeenCalledWith({ clientId: LUMEN.id, assetId: ASSET_ID, contentType: "application/pdf" });
    expect(assets.size).toBe(0);
  });

  it.each([
    ["a .zip", { contentType: "application/zip", sizeBytes: 10 }, "FILE_TYPE_NOT_ALLOWED"],
    ["a GIF", { contentType: "image/gif", sizeBytes: 10 }, "FILE_TYPE_NOT_ALLOWED"],
    ["60 MB", { contentType: "video/mp4", sizeBytes: 60 * MB }, "FILE_TOO_LARGE"],
    ["an empty file", { contentType: "image/png", sizeBytes: 0 }, "FILE_TOO_LARGE"],
  ] as const)("refuses %s before storage with %s", async (_label, declared, code) => {
    const { run, storage } = deps();
    const result = await run(actor, { clientId: LUMEN.id, ...declared });
    expect(result.ok || result.error.code).toBe(code);
    expect(storage.presignUpload).not.toHaveBeenCalled();
  });

  it("accepts exactly 50 MB", async () => {
    const { run } = deps();
    expect((await run(actor, { clientId: LUMEN.id, contentType: "video/quicktime", sizeBytes: 50 * MB })).ok).toBe(true);
  });

  it("refuses a 4th file with CLIENT_MATERIAL_LIMIT", async () => {
    const { run, storage, assets } = deps();
    for (const n of [1, 2, 3]) seedAsset(assets, n);
    const result = await run(actor, { clientId: LUMEN.id, contentType: "image/png", sizeBytes: 10 });
    expect(result.ok || result.error.code).toBe("CLIENT_MATERIAL_LIMIT");
    expect(storage.presignUpload).not.toHaveBeenCalled();
  });

  it("refuses an unknown client with CLIENT_NOT_FOUND", async () => {
    const { run } = deps();
    const result = await run(actor, { clientId: UNKNOWN_CLIENT_ID, contentType: "image/png", sizeBytes: 10 });
    expect(result.ok || result.error.code).toBe("CLIENT_NOT_FOUND");
  });
});

describe("confirmClientMaterialUpload", () => {
  const deps = () => {
    const clients = fakeClientRepository([LUMEN]);
    const storage = fakeMaterialStorage();
    return { ...clients, ...storage, run: makeConfirmClientMaterialUpload({ clients: clients.repo, storage: storage.storage, newId: () => ASSET_ID }) };
  };
  const input = { clientId: LUMEN.id, assetId: ASSET_ID, contentType: "image/jpeg", fileName: " Foto cliente.jpg " };

  it("records an image with its pixels at the lowest free position", async () => {
    const { run, put, assets } = deps();
    seedAsset(assets, 1);
    seedAsset(assets, 3);
    put(LUMEN.id, ASSET_ID, { sizeBytes: 4096, width: 1600, height: 8000 });
    const result = await run(actor, input);
    expect(result).toEqual(
      ok({
        id: ASSET_ID,
        clientId: LUMEN.id,
        position: 2,
        fileName: "Foto cliente.jpg",
        kind: "image",
        contentType: "image/jpeg",
        sizeBytes: 4096,
        width: 1600,
        height: 8000,
        createdAt: expect.any(String),
        thumbnailUrl: null,
      }),
    );
  });

  it("records a PDF with type and size only, never reading its bytes", async () => {
    const { run, put, assets, storage } = deps();
    put(LUMEN.id, ASSET_ID, { contentType: "application/pdf" });
    const result = await run(actor, { ...input, contentType: "application/pdf" });
    expect(result).toMatchObject({ ok: true, value: { kind: "document", width: null, height: null, position: 1 } });
    expect(storage.dimensions).not.toHaveBeenCalled();
    expect(assets.size).toBe(1);
  });

  it.each([
    ["an empty object", { sizeBytes: 0 }],
    ["an object over 50 MB", { sizeBytes: 50 * MB + 1 }],
    ["a stored type other than the declared one", { contentType: "image/png" }],
    ["bytes of another format", { format: "png" }],
    ["bytes that are not an image", { format: null }],
  ] as const)("refuses %s with UPLOAD_REJECTED and writes no row", async (_label, over) => {
    const { run, put, assets } = deps();
    put(LUMEN.id, ASSET_ID, over);
    const result = await run(actor, input);
    expect(result.ok || result.error.code).toBe("UPLOAD_REJECTED");
    expect(assets.size).toBe(0);
  });

  it.each([
    ["a 1200 px short side", { width: 2400, height: 1200 }],
    ["a 1599 px short side", { width: 1599, height: 3000 }],
    ["a side over 8000 px", { width: 8001, height: 1600 }],
  ] as const)("refuses %s with CLIENT_IMAGE_SIZE_INVALID and writes no row", async (_label, over) => {
    const { run, put, assets } = deps();
    put(LUMEN.id, ASSET_ID, over);
    const result = await run(actor, input);
    expect(result.ok || result.error.code).toBe("CLIENT_IMAGE_SIZE_INVALID");
    expect(assets.size).toBe(0);
  });

  it.each([["a blank name", "  "], ["a name over 255 characters", "x".repeat(256)], ["a control character", "a\u0000.jpg"]])(
    "refuses %s as INVALID_INPUT before storage",
    async (_label, fileName) => {
      const { run, storage } = deps();
      const result = await run(actor, { ...input, fileName });
      expect(result.ok || result.error.code).toBe("INVALID_INPUT");
      expect(storage.head).not.toHaveBeenCalled();
    },
  );

  it("refuses a missing object with UPLOAD_NOT_FOUND", async () => {
    const { run, assets } = deps();
    const result = await run(actor, input);
    expect(result.ok || result.error.code).toBe("UPLOAD_NOT_FOUND");
    expect(assets.size).toBe(0);
  });

  it("refuses a 4th file with CLIENT_MATERIAL_LIMIT (the stale-count case); nothing written", async () => {
    const { run, put, assets } = deps();
    for (const n of [1, 2, 3]) seedAsset(assets, n);
    put(LUMEN.id, ASSET_ID);
    const result = await run(actor, input);
    expect(result.ok || result.error.code).toBe("CLIENT_MATERIAL_LIMIT");
    expect(assets.size).toBe(3);
  });

  it("refuses a disallowed type before reading storage", async () => {
    const { run, storage } = deps();
    const result = await run(actor, { ...input, contentType: "application/zip" });
    expect(result.ok || result.error.code).toBe("FILE_TYPE_NOT_ALLOWED");
    expect(storage.head).not.toHaveBeenCalled();
  });

  it("refuses an object uploaded under another client's id", async () => {
    const { run, put, assets } = deps();
    put(UNKNOWN_CLIENT_ID, ASSET_ID);
    const result = await run(actor, input);
    expect(result.ok || result.error.code).toBe("UPLOAD_NOT_FOUND");
    expect(assets.size).toBe(0);
  });

  it("refuses the same asset id confirmed twice; the first row stands", async () => {
    const { run, put, assets } = deps();
    put(LUMEN.id, ASSET_ID);
    expect((await run(actor, input)).ok).toBe(true);
    const again = await run(actor, input);
    expect(again.ok || again.error.code).toBe("ASSET_ALREADY_CONFIRMED");
    expect(assets.size).toBe(1);
  });
});

describe("listClientMaterial", () => {
  it("lists in position order, signing images only for at most 15 minutes", async () => {
    const { repo, assets } = fakeClientRepository([LUMEN]);
    const pdf = seedAsset(assets, 2, { kind: "document", contentType: "application/pdf", width: null, height: null });
    const image = seedAsset(assets, 1);
    const { storage } = fakeMaterialStorage();
    const result = await makeListClientMaterial(repo, storage)({ clientId: LUMEN.id });
    expect(result).toEqual(
      ok([
        { ...image, thumbnailUrl: `https://storage/${LUMEN.id}/${image.id}?sig` },
        { ...pdf, thumbnailUrl: null },
      ]),
    );
    const [targets, ttl] = storage.presignDownloads.mock.calls[0];
    expect(targets).toEqual([{ clientId: LUMEN.id, assetId: image.id, contentType: "image/jpeg" }]);
    expect(ttl).toBeLessThanOrEqual(15 * 60);
  });

  it("lists without thumbnails when signing fails", async () => {
    const { repo, assets } = fakeClientRepository([LUMEN]);
    const image = seedAsset(assets, 1);
    const { storage } = fakeMaterialStorage();
    storage.presignDownloads.mockResolvedValueOnce(err({ code: "STORAGE_FAILED", message: "down" }));
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      expect(await makeListClientMaterial(repo, storage)({ clientId: LUMEN.id })).toEqual(ok([{ ...image, thumbnailUrl: null }]));
    } finally {
      write.mockRestore();
    }
  });

  it("returns CLIENT_NOT_FOUND for an unknown client", async () => {
    const { repo } = fakeClientRepository([LUMEN]);
    const result = await makeListClientMaterial(repo, fakeMaterialStorage().storage)({ clientId: UNKNOWN_CLIENT_ID });
    expect(result.ok || result.error.code).toBe("CLIENT_NOT_FOUND");
  });
});

describe("removeClientMaterial", () => {
  const deps = () => {
    const clients = fakeClientRepository([LUMEN]);
    const storage = fakeMaterialStorage();
    return { ...clients, ...storage, run: makeRemoveClientMaterial({ clients: clients.repo, storage: storage.storage }) };
  };

  it("deletes the row and the object at once", async () => {
    const { run, assets, put, objects, storage } = deps();
    const asset = seedAsset(assets, 1);
    put(LUMEN.id, asset.id);
    expect(await run(actor, { clientId: LUMEN.id, assetId: asset.id })).toEqual(ok(undefined));
    expect(assets.size).toBe(0);
    expect(objects.size).toBe(0);
    expect(storage.remove).toHaveBeenCalledWith({ clientId: LUMEN.id, assetId: asset.id, contentType: "image/jpeg" });
  });

  it("still succeeds when the object delete fails, and logs it with the client id only", async () => {
    const { run, assets, storage } = deps();
    const asset = seedAsset(assets, 1);
    storage.remove.mockResolvedValueOnce(err({ code: "STORAGE_FAILED", message: "down" }));
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      expect(await run(actor, { clientId: LUMEN.id, assetId: asset.id })).toEqual(ok(undefined));
      expect(assets.size).toBe(0);
      const entry = JSON.parse(String(write.mock.calls[0][0]));
      expect(entry).toMatchObject({ clientId: LUMEN.id });
      expect(JSON.stringify(entry)).not.toContain(asset.id);
    } finally {
      write.mockRestore();
    }
  });

  it.each([
    ["an unknown file", () => ASSET_ID],
    ["another client's file", (assets: Map<string, ClientAsset>) => seedAsset(assets, 1, { clientId: UNKNOWN_CLIENT_ID }).id],
  ])("returns NOT_FOUND for %s and deletes nothing", async (_label, pick) => {
    const { run, assets, storage } = deps();
    const assetId = pick(assets);
    const before = assets.size;
    const result = await run(actor, { clientId: LUMEN.id, assetId });
    expect(result.ok || result.error.code).toBe("NOT_FOUND");
    expect(assets.size).toBe(before);
    expect(storage.remove).not.toHaveBeenCalled();
  });
});

describe("deleteClient", () => {
  const LUMEN_SRL: ClientSeed = { id: LUMEN.id, name: "Lumen S.r.l.", code: "LUM", caseCount: 2 };

  it("deletes the client with the typed name, spaces trimmed and collapsed, and returns the cases deleted", async () => {
    const { repo, clients } = fakeClientRepository([LUMEN_SRL]);
    const result = await makeDeleteClient(repo)(actor, { clientId: LUMEN.id, confirmName: "  Lumen   S.r.l. " });
    expect(result).toEqual(ok({ deletedCases: 2 }));
    expect(repo.deleteClient).toHaveBeenCalledExactlyOnceWith(LUMEN.id, "  Lumen   S.r.l. ", actor.id);
    expect(clients.has(LUMEN.id)).toBe(false);
  });

  it("does not count a no-break space as a space", async () => {
    const { repo, clients } = fakeClientRepository([LUMEN_SRL]);
    const result = await makeDeleteClient(repo)(actor, { clientId: LUMEN.id, confirmName: "Lumen\u00a0S.r.l." });
    expect(result.ok || result.error.code).toBe("CLIENT_DELETE_NAME_MISMATCH");
    expect(clients.has(LUMEN.id)).toBe(true);
  });

  it("returns CLIENT_DELETE_NAME_MISMATCH for another name and deletes nothing", async () => {
    const { repo, clients } = fakeClientRepository([LUMEN_SRL]);
    const result = await makeDeleteClient(repo)(actor, { clientId: LUMEN.id, confirmName: "Lumen" });
    expect(result.ok || result.error.code).toBe("CLIENT_DELETE_NAME_MISMATCH");
    expect(clients.has(LUMEN.id)).toBe(true);
  });

  it("returns CLIENT_NOT_FOUND for an unknown or already deleted client", async () => {
    const { repo } = fakeClientRepository([LUMEN_SRL]);
    const run = makeDeleteClient(repo);
    expect(await run(actor, { clientId: LUMEN.id, confirmName: "Lumen S.r.l." })).toEqual(ok({ deletedCases: 2 }));
    const again = await run(actor, { clientId: LUMEN.id, confirmName: "Lumen S.r.l." });
    expect(again.ok || again.error.code).toBe("CLIENT_NOT_FOUND");
    const unknown = await run(actor, { clientId: UNKNOWN_CLIENT_ID, confirmName: "X" });
    expect(unknown.ok || unknown.error.code).toBe("CLIENT_NOT_FOUND");
  });

  it.each([
    ["a malformed id", { clientId: "nope", confirmName: "Lumen S.r.l." }],
    ["no name", { clientId: LUMEN.id }],
    ["an empty name", { clientId: LUMEN.id, confirmName: "" }],
    ["a blank name", { clientId: LUMEN.id, confirmName: " \t\n " }],
    ["no input", null],
  ])("returns INVALID_INPUT for %s and never calls the repository", async (_label, input) => {
    const { repo } = fakeClientRepository([LUMEN_SRL]);
    const result = await makeDeleteClient(repo)(actor, input);
    expect(result.ok || result.error.code).toBe("INVALID_INPUT");
    expect(repo.deleteClient).not.toHaveBeenCalled();
  });

  it("makes every later client write and read answer CLIENT_NOT_FOUND", async () => {
    const { repo } = fakeClientRepository([LUMEN_SRL]);
    await makeDeleteClient(repo)(actor, { clientId: LUMEN.id, confirmName: "Lumen S.r.l." });
    const removed = await makeRemoveClientMaterial({ clients: repo, storage: fakeMaterialStorage().storage })(actor, {
      clientId: LUMEN.id,
      assetId: ASSET_ID,
    });
    expect(removed.ok || removed.error.code).toBe("CLIENT_NOT_FOUND");
    const read = await makeGetClient(repo, fakeLogoStorage().storage)(LUMEN.id);
    expect(read.ok || read.error.code).toBe("CLIENT_NOT_FOUND");
  });
});
