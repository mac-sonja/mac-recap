import { randomUUID } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShellActor } from "@/app/_lib/surface";
import type { CaseStudyRevision, ClientDetail, ClientIntro, ListedCaseStudy, ListedClientAsset } from "@/modules/case-study";
import { buildClientIntroTestDraft } from "@/modules/generation";
import type { ListedAsset, RenditionLink } from "@/modules/material";
import { it as dict, fill } from "@/shared/i18n/it";
import { err, ok, type Result } from "@/shared/result";
import { generatedTextsOf } from "../../../_components/configurator/default-pages";

const requireSurface = vi.fn<(action: string) => Promise<ShellActor | null>>();
const getClient = vi.fn<(id: unknown) => Promise<Result<ClientDetail>>>();
const getClientIntro = vi.fn<(id: unknown) => Promise<Result<ClientIntro | null>>>();
const getEditableRevision = vi.fn<(subject: unknown) => Promise<Result<CaseStudyRevision | null>>>();
const listClientMaterial = vi.fn<(input: unknown) => Promise<Result<ListedClientAsset[]>>>();
const listCases = vi.fn<(scope: unknown) => Promise<Result<ListedCaseStudy[]>>>();
const listAssets = vi.fn<(input: unknown) => Promise<Result<ListedAsset[]>>>();
const getRendition = vi.fn<(assetId: unknown, spec: unknown) => Promise<Result<RenditionLink>>>();
const getClientRendition = vi.fn<(assetId: unknown, spec: unknown) => Promise<Result<RenditionLink>>>();
const listClientSectors = vi.fn<() => Promise<Result<{ key: string; label: string }[]>>>();

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT ${path}`);
  }),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("./actions", () => ({ saveIntroRevisionDoc: vi.fn(), approveIntro: vi.fn(), getIntroRenderAssets: vi.fn() }));
vi.mock("@/app/(tool)/clients/actions", () => ({
  updateClient: vi.fn(),
  addClientSector: vi.fn(),
  saveClientResults: vi.fn(),
  saveClientTestimonial: vi.fn(),
  requestClientLogoUpload: vi.fn(),
  confirmClientLogoUpload: vi.fn(),
  requestClientMaterialUpload: vi.fn(),
  confirmClientMaterialUpload: vi.fn(),
  listClientMaterial: vi.fn(),
}));
vi.mock("@/app/(tool)/case-studies/actions", () => ({
  listAssets: vi.fn(),
  presignAssetUpload: vi.fn(),
  confirmAssetUpload: vi.fn(),
  setAssetFavourite: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/app/_lib/surface", () => ({ requireSurface: (action: string) => requireSurface(action) }));
vi.mock("@/modules/case-study", async () => ({
  ...(await vi.importActual<typeof import("@/modules/case-study/domain/case-study")>("@/modules/case-study/domain/case-study")),
  ...(await vi.importActual<typeof import("@/modules/case-study/domain/client-material")>("@/modules/case-study/domain/client-material")),
  referencedAssetIds: (await vi.importActual<typeof import("@/modules/case-study")>("@/modules/case-study")).referencedAssetIds,
  listClientSectors: () => listClientSectors(),
  getClient: (id: unknown) => getClient(id),
  getClientIntro: (id: unknown) => getClientIntro(id),
  getEditableRevision: (subject: unknown) => getEditableRevision(subject),
  listClientMaterial: (input: unknown) => listClientMaterial(input),
  list: (scope: unknown) => listCases(scope),
}));
vi.mock("@/modules/material", async () => ({
  ...(await vi.importActual<typeof import("@/modules/material/domain/files")>("@/modules/material/domain/files")),
  listAssets: (input: unknown) => listAssets(input),
  getRendition: (assetId: unknown, spec: unknown) => getRendition(assetId, spec),
  getClientRendition: (assetId: unknown, spec: unknown) => getClientRendition(assetId, spec),
}));
const configuratorProps = vi.fn<(props: Record<string, unknown>) => void>();
vi.mock("../../../_components/configurator/configurator", async () => {
  const actual = await vi.importActual<typeof import("../../../_components/configurator/configurator")>("../../../_components/configurator/configurator");
  return {
    Configurator: (props: Parameters<typeof actual.Configurator>[0]) => {
      configuratorProps(props as unknown as Record<string, unknown>);
      return actual.Configurator(props);
    },
  };
});

const { default: ClientConfiguratorPage } = await import("./page");
const actions = await import("./actions");
const clientActions = await import("@/app/(tool)/clients/actions");

const CLIENT_ID = "cccccccc-0000-4000-8000-000000000001";
const INTRO_ID = "44444444-0000-4000-8000-000000000001";
const HEAD_ID = "dddddddd-0000-4000-8000-000000000001";
const CASE_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const IMAGE_1 = "bbbbbbbb-0000-4000-8000-000000000001";
const IMAGE_2 = "bbbbbbbb-0000-4000-8000-000000000002";
const CASE_IMAGE = "bbbbbbbb-0000-4000-8000-0000000000a1";
const now = "2026-11-06T10:00:00+00:00";

const shell: ShellActor = {
  actor: { id: "00000000-0000-4000-8000-000000000002", email: "dev@example.it", displayName: "Dev", role: "owner_designer" },
  landing: "/case-studies",
};

const client: ClientDetail = {
  id: CLIENT_ID,
  name: "Lumen Srl",
  code: "LUM",
  industry: "illuminazione",
  description: "Lampade di design.",
  logoId: "eeeeeeee-0000-4000-8000-000000000001",
  logoUrl: "https://cdn.test/logo.png",
  brief: { context: "Contesto.", solution: "", results: [{ label: "Vendite", value: "+30%" }], testimonialQuote: "Bravi.", testimonialAuthor: "Ada" },
};

const intro = (status: ClientIntro["status"]): ClientIntro => ({
  id: INTRO_ID,
  clientId: CLIENT_ID,
  status,
  headRevisionId: HEAD_ID,
  approvedRevisionId: status === "approved" ? HEAD_ID : null,
  headVersion: 3,
  createdBy: shell.actor.id,
  createdAt: now,
  updatedAt: now,
});

const doc = buildClientIntroTestDraft({ client: { description: "Lampade.", context: "Contesto." }, images: [IMAGE_1, IMAGE_2], resultRows: 1, hasTestimonial: true, newId: randomUUID });
const head = (status: CaseStudyRevision["status"] = "working"): CaseStudyRevision => ({
  id: HEAD_ID,
  caseId: null,
  clientIntroId: INTRO_ID,
  status,
  version: 2,
  generatedDoc: doc,
  doc,
  manifest: {},
  model: null,
  fellBack: false,
  promptVersion: null,
  schemaVersion: 2,
  createdBy: shell.actor.id,
  createdAt: now,
  updatedAt: now,
});

const clientFile = (id: string): ListedClientAsset => ({
  id,
  clientId: CLIENT_ID,
  position: Number(id.slice(-1)),
  fileName: `${id}.jpg`,
  kind: "image",
  contentType: "image/jpeg",
  sizeBytes: 10,
  width: null,
  height: null,
  createdAt: now,
  thumbnailUrl: null,
});
const caseFile: ListedAsset = {
  id: CASE_IMAGE,
  kind: "image",
  originalFileName: "case.jpg",
  contentType: "image/jpeg",
  sizeBytes: 10,
  createdAt: now,
  isFavourite: true,
  thumbnailUrl: null,
  thumbnailPending: false,
};

const render = async () => renderToStaticMarkup(await ClientConfiguratorPage({ params: Promise.resolve({ clientId: CLIENT_ID }) }));
const lastProps = () => configuratorProps.mock.calls.at(-1)![0];

beforeEach(() => {
  for (const fn of [requireSurface, getClient, getClientIntro, getEditableRevision, listClientMaterial, listCases, listAssets, getRendition, getClientRendition, listClientSectors]) fn.mockReset();
  listClientSectors.mockResolvedValue(ok([{ key: "illuminazione", label: "Illuminazione" }]));
  configuratorProps.mockClear();
  requireSurface.mockResolvedValue(shell);
  getClient.mockResolvedValue(ok(client));
  getClientIntro.mockResolvedValue(ok(intro("in_review")));
  getEditableRevision.mockResolvedValue(ok(head()));
  listClientMaterial.mockResolvedValue(ok([clientFile(IMAGE_1), clientFile(IMAGE_2)]));
  listCases.mockResolvedValue(ok([{ id: CASE_ID } as ListedCaseStudy]));
  listAssets.mockResolvedValue(ok([caseFile]));
  getRendition.mockResolvedValue(ok({ url: "https://cdn.test/case", width: 1, height: 1, contentType: "image/webp" }));
  getClientRendition.mockResolvedValue(ok({ url: "https://cdn.test/client", width: 1, height: 1, contentType: "image/webp" }));
});

describe("ClientConfiguratorPage (Story 4.11a)", () => {
  it("opens an intro Da approvare in client mode, editable, with its own actions, header and back", async () => {
    const html = await render();
    expect(requireSurface).toHaveBeenCalledWith("edit");
    expect(getEditableRevision).toHaveBeenCalledWith({ kind: "client_intro", id: INTRO_ID });
    const props = lastProps();
    expect(props.subject).toEqual({ kind: "client_intro", id: INTRO_ID, clientId: CLIENT_ID });
    expect(props.revision).toEqual({ id: HEAD_ID, version: 2, editable: true, kind: "client_intro" });
    expect(props.header).toEqual({ name: fill(dict.configurator.clientTitle, { name: "Lumen Srl" }), code: "LUM", status: "in_review" });
    expect(props.back).toEqual({ href: `/clients/${CLIENT_ID}`, label: dict.configurator.clientBack });
    expect(props.onSave).toBe(actions.saveIntroRevisionDoc);
    expect(props.onApprove).toBe(actions.approveIntro);
    expect(props.onRenderAssets).toBe(actions.getIntroRenderAssets);
    expect(props.headVersion).toBe(3);
    expect(props.onFork).toBeUndefined();
    // Introduzione and Chiusura group the pages.
    expect(html).toContain(dict.configurator.clientSections.intro);
    expect(html).toContain(dict.configurator.clientSections.outro);
    expect(html).toContain("Lumen Srl · Pagine cliente");
  });

  it("gives the Media tab the client's files (uploads to the client) and its cases' under Dalle sue case", async () => {
    await render();
    const props = lastProps();
    expect((props.media as ListedAsset[]).map((f) => f.id)).toEqual([IMAGE_1, IMAGE_2]);
    expect((props.clientMedia as ListedAsset[]).map((f) => f.id)).toEqual([CASE_IMAGE]);
    expect(listCases).toHaveBeenCalledWith({ clientId: CLIENT_ID });
    expect(props.mediaRules).toMatchObject({ maxFiles: 3, imagePixels: { min: 1600, max: 8000 } });
    expect(props.clientFiles).toEqual([{ id: CASE_IMAGE, name: "case.jpg" }]);
    expect(props.assets).toMatchObject({ [IMAGE_1]: { url: "https://cdn.test/client" }, [CASE_IMAGE]: { url: "https://cdn.test/case" } });
  });

  it("edits the client's fields through the client's actions, and fills Pagine di default from the client template's texts", async () => {
    await render();
    const props = lastProps();
    expect(props.fields).toEqual({
      client: { id: CLIENT_ID, name: "Lumen Srl", industry: "illuminazione", description: "Lampade di design.", logoId: client.logoId },
      record: { results: [{ label: "Vendite", value: "+30%" }], testimonial: { quote: "Bravi.", author: "Ada" } },
    });
    expect(props.fieldActions).toEqual({
      updateClient: clientActions.updateClient,
      addClientSector: clientActions.addClientSector,
      saveClientResults: clientActions.saveClientResults,
      saveClientTestimonial: clientActions.saveClientTestimonial,
    });
    expect(props.generatedTexts).toEqual(generatedTextsOf(doc));
    const texts = generatedTextsOf(doc).presentazione_16_9!;
    expect(texts.introHead?.text).toContain("Chi è il cliente");
    expect(texts.outroHead?.text).toContain("Cosa abbiamo costruito insieme");
    expect(props.images).toEqual([IMAGE_1, IMAGE_2]);
    expect(props.values).toMatchObject({ client: { name: "Lumen Srl", sector: "Illuminazione", results: [{ label: "Vendite", value: "+30%" }] } });
  });

  it("leaves out a case whose files can't be read, keeping the others' (the page still opens)", async () => {
    const BROKEN = "aaaaaaaa-0000-4000-8000-000000000002";
    listCases.mockResolvedValue(ok([{ id: BROKEN } as ListedCaseStudy, { id: CASE_ID } as ListedCaseStudy]));
    listAssets.mockImplementation(async (input) =>
      (input as { caseId: string }).caseId === BROKEN ? err({ code: "MATERIAL_LOOKUP_FAILED", message: "down" }) : ok([caseFile]),
    );
    await render();
    expect((lastProps().clientMedia as ListedAsset[]).map((f) => f.id)).toEqual([CASE_IMAGE]);
  });

  it("marks a client file with no rendition yet as pending, so the Media tab keeps asking for it", async () => {
    getClientRendition.mockImplementation(async (assetId) =>
      assetId === IMAGE_2 ? err({ code: "RENDITION_NOT_READY", message: "m" }) : ok({ url: "https://cdn.test/client", width: 1, height: 1, contentType: "image/webp" }),
    );
    await render();
    expect((lastProps().media as ListedAsset[]).map((f) => [f.id, f.thumbnailPending])).toEqual([
      [IMAGE_1, false],
      [IMAGE_2, true],
    ]);
  });

  it("shows the client's sector key when the shared sector list can't be read", async () => {
    listClientSectors.mockResolvedValue(err({ code: "CLIENT_SECTOR_LOOKUP_FAILED", message: "m" }));
    await render();
    expect(lastProps().values).toMatchObject({ client: { sector: "illuminazione" } });
  });

  it("opens an Approvato intro read-only", async () => {
    getClientIntro.mockResolvedValue(ok(intro("approved")));
    getEditableRevision.mockResolvedValue(ok(head("approved")));
    await render();
    expect(lastProps().revision).toMatchObject({ editable: false });
    expect(lastProps().header).toMatchObject({ status: "approved" });
  });

  it.each([
    ["no intro", () => getClientIntro.mockResolvedValue(ok(null))],
    ["an intro in Bozza", () => getClientIntro.mockResolvedValue(ok(intro("draft")))],
    ["an intro In elaborazione", () => getClientIntro.mockResolvedValue(ok(intro("generating")))],
    ["no head revision", () => getEditableRevision.mockResolvedValue(ok(null))],
  ])("goes back to the client page with %s", async (_name, arrange) => {
    arrange();
    await expect(render()).rejects.toThrow(`REDIRECT /clients/${CLIENT_ID}`);
  });

  it("goes back to Clienti for an unknown client", async () => {
    getClient.mockResolvedValue(err({ code: "CLIENT_NOT_FOUND", message: "m" }));
    await expect(render()).rejects.toThrow("REDIRECT /clients");
  });

  it("throws into the error boundary when the intro can't be read", async () => {
    getClientIntro.mockResolvedValue(err({ code: "CLIENT_INTRO_LOOKUP_FAILED", message: "m" }));
    await expect(render()).rejects.toThrow(/CLIENT_INTRO_LOOKUP_FAILED/);
  });
});
