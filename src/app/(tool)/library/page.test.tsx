import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShellActor } from "@/app/_lib/surface";
import type { Role } from "@/modules/access";
import type { CaseClientInfo, CaseStudyRevision, ClientDetail, ListedCaseStudy, ListScope } from "@/modules/case-study";
import { caseHistoryV2 } from "@/modules/generation";
import type { DetailsForm, ListedAsset, RenditionLink } from "@/modules/material";
import { FORMAT_IDS } from "@/modules/rendering";
import { err, ok, type Result } from "@/shared/result";
import type { SearchParams } from "./_lib/library-data";

const requireSurface = vi.fn<(action: string, resource?: unknown) => Promise<ShellActor | null>>();
const list = vi.fn<(scope: ListScope) => Promise<Result<ListedCaseStudy[]>>>();
const getLiveRevision = vi.fn<(subject: unknown) => Promise<Result<CaseStudyRevision | null>>>();
const getEditableRevision = vi.fn<(subject: unknown) => Promise<Result<CaseStudyRevision | null>>>();
const getClientInfoForCase = vi.fn<(id: unknown) => Promise<Result<CaseClientInfo>>>();
const getClient = vi.fn<(id: unknown) => Promise<Result<ClientDetail>>>();
const getDetailsForm = vi.fn<(input: unknown) => Promise<Result<DetailsForm>>>();
const listAssets = vi.fn<(input: unknown) => Promise<Result<ListedAsset[]>>>();
const getRendition = vi.fn<(assetId: unknown, spec: unknown) => Promise<Result<RenditionLink>>>();

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT ${path}`);
  }),
}));
vi.mock("@/app/_lib/surface", async () => {
  const { can } = await vi.importActual<typeof import("@/modules/access")>("@/modules/access");
  const { redirect } = await import("next/navigation");
  // The real guard's decision, on the mocked shell: a role that may not do it goes to its landing.
  return {
    requireSurface: async (action: string, resource?: unknown) => {
      const shell = await requireSurface(action, resource);
      if (shell !== null && !can(shell.actor, action as never, resource as never)) redirect(shell.landing);
      return shell;
    },
  };
});
vi.mock("@/modules/case-study", async () => {
  const actual = await vi.importActual<typeof import("@/modules/case-study")>("@/modules/case-study");
  return {
    referencedAssetIds: actual.referencedAssetIds,
    BUSINESS_LINES: actual.BUSINESS_LINES,
    listClientSectors: async () => ok([{ key: "moda", label: "Moda" }]),
    list: (scope: ListScope) => list(scope),
    getLiveRevision: (subject: unknown) => getLiveRevision(subject),
    getEditableRevision: (subject: unknown) => getEditableRevision(subject),
    getClientInfoForCase: (id: unknown) => getClientInfoForCase(id),
    getClient: (id: unknown) => getClient(id),
  };
});
vi.mock("@/modules/material", () => ({
  getDetailsForm: (input: unknown) => getDetailsForm(input),
  listAssets: (input: unknown) => listAssets(input),
  getRendition: (assetId: unknown, spec: unknown) => getRendition(assetId, spec),
}));

const { default: LibraryPage } = await import("./page");
const { default: Loading } = await import("./loading");

const CLIENT_ID = "cccccccc-0000-4000-8000-000000000001";
const COVER_IMAGE = "bbbbbbbb-0000-4000-8000-000000000001";
const OTHER_IMAGE = "bbbbbbbb-0000-4000-8000-000000000002";
const PENDING = "bbbbbbbb-0000-4000-8000-000000000003";
const EDITED_IMAGE = "bbbbbbbb-0000-4000-8000-000000000004";

const shellFor = (role: Role): ShellActor => ({
  actor: { id: "00000000-0000-4000-8000-000000000002", email: "dev@example.it", displayName: "Dev", role },
  landing: role === "account_sales_social" ? "/library" : "/home",
});

const idOf = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;

const listedCase = (n: number, over: Partial<ListedCaseStudy> = {}): ListedCaseStudy => ({
  id: idOf(n),
  code: `LUM-2026-${String(n).padStart(2, "0")}`,
  number: n,
  name: `Caso ${n}`,
  client: { id: CLIENT_ID, name: "Lumen Srl", code: "LUM" },
  year: 2026,
  locale: "it",
  businessLines: ["branding"],
  status: "approved",
  projectOrderRef: null,
  headRevisionId: "dddddddd-0000-4000-8000-000000000001",
  approvedRevisionId: "dddddddd-0000-4000-8000-000000000001",
  headVersion: 1,
  createdBy: "00000000-0000-4000-8000-000000000002",
  createdAt: "2026-10-01T10:00:00+00:00",
  updatedAt: "2026-10-20T10:00:00+00:00",
  deletedAt: null,
  inReviewSince: null,
  // Case n was approved on day n of October: a higher n is newer.
  approvedAt: `2026-10-${String(Math.min(n, 28)).padStart(2, "0")}T${String(n % 24).padStart(2, "0")}:00:00+00:00`,
  ...over,
});

/** A case history document whose formats' first page shows `assetId`; page 2 shows OTHER_IMAGE. */
function docWith(assetId: string): CaseStudyRevision["doc"] {
  const doc = caseHistoryV2(FORMAT_IDS);
  for (const entry of Object.values(doc.formats)) {
    entry.pages[0]!.blocks[0]!.elements = [{ elementId: "eeeeeeee-0000-4000-8000-000000000001", type: "image", assetId, fit: "fill" }];
    entry.pages[1]!.blocks[0]!.elements = [{ elementId: "eeeeeeee-0000-4000-8000-000000000002", type: "image", assetId: OTHER_IMAGE, fit: "fill" }];
  }
  return doc;
}

const revisionOf = (doc: CaseStudyRevision["doc"], status: CaseStudyRevision["status"] = "approved"): CaseStudyRevision => ({
  id: "dddddddd-0000-4000-8000-000000000001",
  caseId: idOf(1),
  clientIntroId: null,
  status,
  version: 1,
  generatedDoc: doc,
  doc,
  manifest: {} as CaseStudyRevision["manifest"],
  model: null,
  fellBack: false,
  promptVersion: null,
  schemaVersion: 2,
  createdBy: "00000000-0000-4000-8000-000000000002",
  createdAt: "2026-10-14T10:00:00+00:00",
  updatedAt: "2026-10-14T10:00:00+00:00",
});

const info: CaseClientInfo = {
  clientId: CLIENT_ID,
  name: "Lumen Srl",
  industry: { key: "illuminazione", label: "Illuminazione" },
  description: "Lampade di design.",
  logoId: null,
  brief: { context: "", solution: "", results: [], testimonialQuote: "", testimonialAuthor: "" },
};

const form: DetailsForm = { context: "", solution: "", results: [], testimonialQuote: "", testimonialAuthor: "" };

const asset = (id: string): ListedAsset => ({
  id,
  kind: "image",
  originalFileName: `${id}.png`,
  contentType: "image/png",
  sizeBytes: 1000,
  createdAt: "2026-10-14T10:00:00+00:00",
  isFavourite: false,
  thumbnailUrl: null,
  thumbnailPending: false,
});

const render = async (params: SearchParams = {}) => renderToStaticMarkup(await LibraryPage({ searchParams: Promise.resolve(params) }));

/** The case ids of the cards, in order. */
const cardIds = (html: string) => [...html.matchAll(/data-case-id="([^"]+)"/g)].map((m) => m[1]);

beforeEach(() => {
  for (const fn of [requireSurface, list, getLiveRevision, getEditableRevision, getClientInfoForCase, getClient, getDetailsForm, listAssets, getRendition]) {
    fn.mockReset();
  }
  requireSurface.mockResolvedValue(shellFor("account_sales_social"));
  list.mockResolvedValue(ok([listedCase(1)]));
  getLiveRevision.mockResolvedValue(ok(revisionOf(docWith(COVER_IMAGE))));
  getEditableRevision.mockResolvedValue(ok(revisionOf(docWith(EDITED_IMAGE), "working")));
  getClientInfoForCase.mockResolvedValue(ok(info));
  getClient.mockResolvedValue(
    ok({ id: CLIENT_ID, name: "Lumen Srl", code: "LUM", industry: "illuminazione", description: "", logoId: null, brief: info.brief, logoUrl: null } as ClientDetail),
  );
  getDetailsForm.mockResolvedValue(ok(form));
  listAssets.mockResolvedValue(ok([asset(COVER_IMAGE), asset(OTHER_IMAGE), asset(PENDING), asset(EDITED_IMAGE)]));
  getRendition.mockImplementation(async (assetId, spec) =>
    assetId === PENDING
      ? err({ code: "RENDITION_NOT_READY", message: "Not ready." })
      : ok({ url: `https://cdn.test/${String(assetId)}/${String(spec)}`, width: 100, height: 100, contentType: "image/webp" }),
  );
});

describe("LibraryPage", () => {
  it("lists approved cases only, through the `list cases` approved scope", async () => {
    list.mockResolvedValue(ok([listedCase(1), listedCase(2, { status: "in_review", approvedAt: null }), listedCase(3, { status: "draft", approvedAt: null })]));
    const html = await render();
    expect(requireSurface).toHaveBeenCalledWith("list cases", { status: "approved" });
    expect(list).toHaveBeenCalledExactlyOnceWith({ status: "approved" });
    expect(cardIds(html)).toEqual([idOf(1)]);
    expect(html).toMatch(/<h1[^>]*>Libreria<\/h1>/);
    // No status badge or filter, no Share or Export on cards; no selection bar until a card is picked.
    expect(html).not.toContain("data-status=");
    expect(html).not.toContain("Approvato");
    expect(html).not.toMatch(/Condividi|Esporta|Scarica|Crea raccolta/);
  });

  it.each(["owner_designer", "admin", "account_sales_social"] as const)("gives each card a checkbox outside its link for %s (Story 5.10a)", async (role) => {
    requireSurface.mockResolvedValue(shellFor(role));
    list.mockResolvedValue(ok([listedCase(1, { name: "Rebrand Lumen" })]));
    const html = await render();
    const item = html.match(/<li class="relative min-w-0">[\s\S]*?<\/li>/)?.[0] ?? "";
    expect(item).toMatch(/<input type="checkbox" data-select-case="aaaaaaaa-0000-4000-8000-000000000001" aria-label="Seleziona Rebrand Lumen"/);
    // The checkbox sits before the card's link, never inside it.
    const link = item.match(/<a [\s\S]*?<\/a>/)?.[0] ?? "";
    expect(link).not.toContain('type="checkbox"');
  });

  it("shows each card's name, client and year, and links it to the case view", async () => {
    list.mockResolvedValue(ok([listedCase(1, { name: "Rebrand Lumen", year: 2025 })]));
    const html = await render();
    const card = html.match(/<a href="\/case-studies\/aaaaaaaa-0000-4000-8000-000000000001"[^>]*>[\s\S]*?<\/a>/)?.[0] ?? "";
    expect(card).toContain("Rebrand Lumen");
    expect(card).toContain("Lumen Srl");
    expect(card).toContain("2025");
    // A link is reachable with Tab and opens with Enter; the cover is decoration.
    expect(card).toMatch(/<span aria-hidden="true" inert=""/);
  });

  it("puts the newest approval first, 24 on page 1 and the rest on page 2", async () => {
    list.mockResolvedValue(ok(Array.from({ length: 30 }, (_, i) => listedCase(i + 1))));
    const first = await render();
    expect(cardIds(first)).toEqual(Array.from({ length: 24 }, (_, i) => idOf(30 - i)));
    expect(first).toContain('aria-label="Pagine della libreria"');
    expect(first).toMatch(/<a href="\/library\?pagina=2" aria-label="Pagina 2"/);
    expect(first).toMatch(/aria-label="Pagina 1" aria-current="page"/);
    const second = await render({ pagina: "2" });
    expect(cardIds(second)).toEqual(Array.from({ length: 6 }, (_, i) => idOf(6 - i)));
    // A page past the last shows the last.
    expect(cardIds(await render({ pagina: "9" }))).toEqual(cardIds(second));
    // Only the cards shown read their covers.
    getLiveRevision.mockClear();
    await render();
    expect(getLiveRevision).toHaveBeenCalledTimes(24);
  });

  it("puts a case approved after another first, even when the other was updated later", async () => {
    list.mockResolvedValue(
      ok([
        listedCase(1, { approvedAt: "2026-10-01T10:00:00+00:00", updatedAt: "2026-10-30T10:00:00+00:00" }),
        listedCase(2, { approvedAt: "2026-10-05T10:00:00+00:00", updatedAt: "2026-10-05T10:00:00+00:00" }),
      ]),
    );
    expect(cardIds(await render())).toEqual([idOf(2), idOf(1)]);
  });

  it("draws the cover from the live revision's Presentazione page 1, signing only that page's renditions", async () => {
    const html = await render();
    expect(getLiveRevision).toHaveBeenCalledWith({ kind: "case", id: idOf(1) });
    expect(getEditableRevision).not.toHaveBeenCalled();
    expect(html).toContain('data-template="mac-case@1"');
    expect(html).toContain('data-format="presentazione_16_9"');
    expect(html).toContain(`https://cdn.test/${COVER_IMAGE}/image.display`);
    // Page 2's image and the edit's image are never signed.
    expect(getRendition.mock.calls.map(([id]) => id)).toEqual([COVER_IMAGE]);
    expect(html).not.toContain(EDITED_IMAGE);
  });

  it("shows the approved page, not a later edit on the head", async () => {
    // The head is a working revision with another image; the library reads the live one only.
    const html = await render();
    expect(html).toContain(`${COVER_IMAGE}/image.display`);
    expect(html).not.toContain(`${EDITED_IMAGE}/`);
  });

  it("leaves a not-ready rendition's cell empty and still shows the card", async () => {
    getLiveRevision.mockResolvedValue(ok(revisionOf(docWith(PENDING))));
    const html = await render();
    expect(cardIds(html)).toEqual([idOf(1)]);
    expect(html).toContain("data-cover=");
    expect(html).not.toContain(`${PENDING}/`);
  });

  it("shows a neutral placeholder when the live revision has no Presentazione page", async () => {
    const doc = caseHistoryV2(FORMAT_IDS.filter((id) => id !== "presentazione_16_9"));
    getLiveRevision.mockResolvedValue(ok(revisionOf(doc)));
    list.mockResolvedValue(ok([listedCase(1, { name: "Senza pagine" })]));
    const html = await render();
    expect(html).toContain("data-cover-placeholder=");
    expect(html).not.toContain("data-cover=");
    expect(html).toContain("Senza pagine");
    expect(html).toContain("Lumen Srl");
  });

  it("shows the placeholder, and the card, when a cover can't be read", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      getLiveRevision.mockResolvedValue(err({ code: "REVISION_POINTER_INVALID", message: "x" }));
      const html = await render();
      expect(html).toContain("data-cover-placeholder=");
      expect(cardIds(html)).toEqual([idOf(1)]);
      expect(String(write.mock.calls[0]?.[0])).toContain("REVISION_POINTER_INVALID");
    } finally {
      write.mockRestore();
    }
  });

  it("draws the covers without the logo when the client lookup fails", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      getClient.mockResolvedValue(err({ code: "CLIENT_LOOKUP_FAILED", message: "x" }));
      list.mockResolvedValue(ok([listedCase(1), listedCase(2)]));
      const html = await render();
      expect(html.match(/data-cover=""/g)).toHaveLength(2);
      expect(html).not.toContain("data-cover-placeholder=");
      expect(getClient).toHaveBeenCalledTimes(1);
    } finally {
      write.mockRestore();
    }
  });

  it("has no focusable arrow before the first page or after the last", async () => {
    list.mockResolvedValue(ok(Array.from({ length: 30 }, (_, i) => listedCase(i + 1))));
    const first = await render();
    expect(first).not.toContain("Pagina precedente");
    expect(first).toMatch(/<a href="\/library\?pagina=2" aria-label="Pagina successiva"/);
    const last = await render({ pagina: "2" });
    expect(last).not.toContain("Pagina successiva");
    expect(last).toMatch(/<a href="\/library" aria-label="Pagina precedente"/);
    expect(first).not.toContain('role="link"');
  });

  it("searches as the table does and combines the facets", async () => {
    list.mockResolvedValue(
      ok([
        listedCase(1, { name: "Sito", year: 2025 }),
        listedCase(2, { name: "Rebrand", year: 2026 }),
        listedCase(3, { name: "Campagna", code: "ACM-2025-01", client: { id: "cccccccc-0000-4000-8000-000000000002", name: "Acme Spa", code: "ACM" }, year: 2025 }),
        listedCase(4, { name: "Video", code: "BET-2025-01", client: { id: "cccccccc-0000-4000-8000-000000000003", name: "Beta Srl", code: "BET" }, year: 2025 }),
      ]),
    );
    expect(cardIds(await render({ q: "lum" }))).toEqual([idOf(2), idOf(1)]);
    const facets = await render({ cliente: ["LUM", "ACM"], anno: "2025" });
    expect(cardIds(facets)).toEqual([idOf(3), idOf(1)]);
    // The facet chips and the active filters, each removable, with Azzera tutto.
    expect(facets).toMatch(/<button type="button" aria-pressed="true"[^>]*>.*?Acme Spa<\/button>/);
    expect(facets).toMatch(/<button type="button" aria-pressed="false"[^>]*>Beta Srl<\/button>/);
    expect(facets).toContain('aria-label="Filtri attivi"');
    expect(facets).toContain('aria-label="Togli Lumen Srl"');
    expect(facets).toContain('aria-label="Togli 2025"');
    expect(facets).toContain("Azzera tutto");
    expect(cardIds(await render({ q: "sito", cliente: ["LUM", "ACM"], anno: "2025" }))).toEqual([idOf(1)]);
  });

  it("says when nothing matches, with Azzera ricerca e filtri", async () => {
    let html = await render({ q: "zzz" });
    expect(cardIds(html)).toEqual([]);
    expect(html).toMatch(/<p role="status"[^>]*>Nessun risultato per “zzz”\.<\/p>/);
    expect(html).toMatch(/<a href="\/library"[^>]*>Azzera ricerca e filtri<\/a>/);
    list.mockResolvedValue(ok([listedCase(1, { year: 2025 }), listedCase(2, { year: 2026, client: { id: "cccccccc-0000-4000-8000-000000000002", name: "Acme Spa", code: "ACM" } })]));
    html = await render({ cliente: "ACM", anno: "2025" });
    expect(html).toContain("Nessun risultato con questi filtri.");
  });

  it("says no case is approved yet, with no action", async () => {
    list.mockResolvedValue(ok([listedCase(1, { status: "in_review", approvedAt: null })]));
    const html = await render();
    expect(html).toContain("Ancora nessuna case history approvata.");
    expect(html).not.toContain("<button");
    expect(html).not.toContain('type="search"');
    expect(html).not.toMatch(/<a [^>]*href="\/library/);
  });

  it("shows the Tabella / Libreria switch to an owner/designer, and none to account/sales/social", async () => {
    requireSurface.mockResolvedValue(shellFor("owner_designer"));
    const owner = await render();
    expect(owner).toContain('aria-label="Vista"');
    expect(owner).toMatch(/<a href="\/case-studies"[^>]*>Tabella<\/a>/);
    expect(owner).toMatch(/<a href="\/library" aria-current="page"[^>]*>Libreria<\/a>/);
    // The owner sees the same approved-only list.
    expect(list).toHaveBeenCalledWith({ status: "approved" });
    requireSurface.mockResolvedValue(shellFor("account_sales_social"));
    expect(await render()).not.toContain('aria-label="Vista"');
  });

  it("sends a role that may not list approved cases to its landing", async () => {
    requireSurface.mockResolvedValue(shellFor("system" as Role));
    await expect(render()).rejects.toThrow("REDIRECT");
    expect(list).not.toHaveBeenCalled();
  });

  it("renders nothing without a usable actor", async () => {
    requireSurface.mockResolvedValue(null);
    expect(await render()).toBe("");
    expect(list).not.toHaveBeenCalled();
  });

  it("throws into the error boundary when the list fails", async () => {
    list.mockResolvedValue(err({ code: "CASE_STUDY_LOOKUP_FAILED", message: "x" }));
    await expect(render()).rejects.toThrow("CASE_STUDY_LOOKUP_FAILED");
  });
});

describe("Loading", () => {
  it("shows skeleton cards and a screen-reader status", () => {
    const html = renderToStaticMarkup(<Loading />);
    expect(html).toContain('aria-busy="true"');
    expect(html).toMatch(/<p role="status" class="sr-only">Un attimo…<\/p>/);
    expect(html.match(/data-skeleton-card=""/g)?.length).toBeGreaterThan(0);
    expect(html).toContain("motion-safe:animate-pulse");
  });
});
