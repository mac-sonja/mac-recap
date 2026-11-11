import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeClientIntroTextSource, type ClientIntroSourceDeps } from "@/modules/generation/application/client-intro-text-source";
import { MAX_EXTRACTED_CHARS, MAX_PDF_PAGES, REQUEST_BUDGET_BYTES } from "@/modules/generation/application/request-documents";
import { clientTestTextSource, type ClientTextSourceInput } from "@/modules/generation/application/text-source";
import { CLIENT_INTRO_TEXT_LIMITS, type ClientIntroRequest, type ClientIntroResult, type ClientIntroText } from "@/modules/generation/ports/client-intro-writer";
import { CLIENT_TEMPLATE_TEXT_KEYS } from "@/modules/rendering";
import { err, ok, type Result } from "@/shared/result";

const CLIENT_ID = "cccccccc-0000-4000-8000-0000000000c1";
const id = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;
const SECRET = "Lumen progetta lampade per hotel dal 1990.";

const fullClient: ClientTextSourceInput["client"] = {
  name: "Lumen",
  industry: "interior_design",
  description: SECRET,
  brief: { context: "Contesto", solution: "Soluzione", results: [{ label: "Visite", value: "+40%" }], testimonialQuote: "Bravi", testimonialAuthor: "Anna" },
};
const assets: ClientTextSourceInput["assets"] = [
  { id: id(1), kind: "image", contentType: "image/jpeg" },
  { id: id(2), kind: "document", contentType: "application/pdf" },
  { id: id(3), kind: "image", contentType: "image/png" },
  { id: id(4), kind: "video", contentType: "video/mp4" },
  { id: id(5), kind: "document", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
];

function answer(over: Partial<ClientIntroText> = {}): ClientIntroResult {
  return {
    texts: Object.fromEntries(
      CLIENT_TEMPLATE_TEXT_KEYS.map((k) => [k, { text: `Testo ${k}`, sourceRefs: [{ kind: "client_field", id: "description" }], ...over }]),
    ) as ClientIntroResult["texts"],
    model: "claude-opus-5-5",
    fellBack: false,
    promptVersion: "client-intro@1",
  };
}

let write: ReturnType<typeof vi.fn<(r: ClientIntroRequest) => Promise<Result<ClientIntroResult>>>>;
let deps: ClientIntroSourceDeps;
let logged = "";
const sent = () => write.mock.calls[0][0];

beforeEach(() => {
  logged = "";
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    logged += String(chunk);
    return true;
  });
  write = vi.fn(async () => ok(answer()));
  deps = {
    writer: { write },
    documents: {
      docxText: vi.fn(async () => "Testo del DOCX"),
      pdfPageCount: vi.fn(async () => 4),
      pdfText: vi.fn(async () => "Testo del PDF"),
    },
    readClientFileBytes: vi.fn(async () => ok({ bytes: new Uint8Array(30), contentType: "application/pdf" })),
    listClientSectors: vi.fn(async () => ok([{ key: "interior_design", label: "Interior design" }])),
  };
});

const run = (client = fullClient, files = assets) => makeClientIntroTextSource(deps).texts({ clientId: CLIENT_ID, client, assets: files });

describe("client intro text source: what the AI gets (Story 3.9)", () => {
  it("the client's fields with the sector's label, and only its PDF: no images, videos or other files", async () => {
    const out = await run();
    expect(out.ok).toBe(true);
    expect(sent()).toEqual({
      locale: "it",
      client: {
        name: "Lumen",
        industry: "Interior design",
        description: SECRET,
        brief: { context: "Contesto", solution: "Soluzione", results: [{ label: "Visite", value: "+40%" }], testimonial: { quote: "Bravi", author: "Anna" } },
      },
      documents: [{ assetId: id(2), kind: "pdf", bytes: new Uint8Array(30) }],
    });
    expect(vi.mocked(deps.readClientFileBytes).mock.calls.map((c) => c[0])).toEqual([{ clientId: CLIENT_ID, assetId: id(2) }]);
    expect(deps.documents.docxText).not.toHaveBeenCalled();
    expect(out.ok && out.value.meta).toEqual({ model: "claude-opus-5-5", fellBack: false, promptVersion: "client-intro@1" });
    expect(logged).not.toContain(SECRET);
    expect(logged).not.toContain("Testo introHead");
  });

  it("a PDF over the page limit goes as its extracted text", async () => {
    vi.mocked(deps.documents.pdfPageCount).mockResolvedValue(MAX_PDF_PAGES + 1);
    await run();
    expect(sent().documents).toEqual([{ assetId: id(2), kind: "text", text: "Testo del PDF" }]);
  });

  it("a PDF over the byte budget goes as its extracted text", async () => {
    vi.mocked(deps.readClientFileBytes).mockResolvedValueOnce(ok({ bytes: new Uint8Array(REQUEST_BUDGET_BYTES), contentType: "application/pdf" }));
    await run();
    expect(sent().documents).toEqual([{ assetId: id(2), kind: "text", text: "Testo del PDF" }]);
  });

  it("extracted text is cut at the limit, and the text of a later PDF is left out", async () => {
    const pdfs = [6, 7].map((n) => ({ id: id(n), kind: "document", contentType: "application/pdf" }));
    vi.mocked(deps.documents.pdfPageCount).mockResolvedValue(MAX_PDF_PAGES + 1);
    vi.mocked(deps.documents.pdfText).mockResolvedValue("y".repeat(MAX_EXTRACTED_CHARS + 10));
    expect((await run(fullClient, pdfs)).ok).toBe(true);
    expect(sent().documents).toEqual([{ assetId: id(6), kind: "text", text: "y".repeat(MAX_EXTRACTED_CHARS) }]);
  });

  it("a PDF whose page count or text cannot be read is skipped, and the attempt goes on", async () => {
    const pdfs = [6, 7].map((n) => ({ id: id(n), kind: "document", contentType: "application/pdf" }));
    vi.mocked(deps.documents.pdfPageCount).mockRejectedValueOnce(new Error(SECRET)).mockResolvedValueOnce(MAX_PDF_PAGES + 1);
    vi.mocked(deps.documents.pdfText).mockRejectedValueOnce(new Error(SECRET));
    expect((await run(fullClient, pdfs)).ok).toBe(true);
    expect(sent().documents).toEqual([]);
    expect(logged).not.toContain(SECRET);
  });

  it("an unknown sector key sends no sector and logs a warning", async () => {
    vi.mocked(deps.listClientSectors).mockResolvedValueOnce(ok([{ key: "energia", label: "Energia" }]));
    expect((await run()).ok).toBe(true);
    expect(sent().client.industry).toBeNull();
    expect(logged).toContain("generate sends no sector");
  });

  it("a removed PDF is skipped; another read error fails the attempt, retryable; a sector lookup error too", async () => {
    vi.mocked(deps.readClientFileBytes).mockResolvedValueOnce(err({ code: "NOT_FOUND", message: "m" }));
    expect((await run()).ok).toBe(true);
    expect(sent().documents).toEqual([]);
    vi.mocked(deps.readClientFileBytes).mockResolvedValueOnce(err({ code: "STORAGE_FAILED", message: "m" }));
    expect(await run()).toMatchObject({ ok: false, error: { code: "MATERIAL_READ_FAILED", retryable: true } });
    vi.mocked(deps.listClientSectors).mockResolvedValueOnce(err({ code: "CLIENT_LOOKUP_FAILED", message: "m" }));
    expect(await run()).toMatchObject({ ok: false, error: { code: "CLIENT_LOOKUP_FAILED", retryable: true } });
  });

  it("a sparse client (no brief, no PDF): only name, sector and description; a ref to an empty field is refused", async () => {
    const sparse = { ...fullClient, brief: { context: "", solution: "", results: [], testimonialQuote: "", testimonialAuthor: "" } };
    const out = await run(sparse, [assets[0], assets[2]]);
    expect(out.ok).toBe(true);
    expect(sent().client.brief).toEqual({ context: "", solution: "", results: [], testimonial: null });
    expect(sent().documents).toEqual([]);
    write.mockResolvedValueOnce(ok(answer({ sourceRefs: [{ kind: "client_field", id: "context" }] })));
    expect(await run(sparse, [])).toMatchObject({ ok: false, error: { code: "INVALID_SOURCE_REF", retryable: false } });
  });
});

describe("client intro text source: the AI's answer", () => {
  it("the four texts, trimmed, with client_field and PDF refs kept (deduplicated) and the aspect", async () => {
    const withBody = answer();
    withBody.texts.outroBody = {
      text: "  Una luce per l'ospitalità  ",
      aspect: "graphic",
      sourceRefs: [{ kind: "client_field", id: "name" }, { kind: "asset", id: id(2) }, { kind: "asset", id: id(2) }],
    };
    write.mockResolvedValueOnce(ok(withBody));
    const out = await run();
    expect(out.ok && out.value.texts.outroBody).toEqual({
      text: "Una luce per l'ospitalità",
      aspect: "graphic",
      sourceRefs: [{ kind: "client_field", id: "name" }, { kind: "asset", id: id(2) }],
    });
  });

  it("a ref to anything not sent is INVALID_SOURCE_REF, final: an image, an unknown field, an unknown file", async () => {
    for (const ref of [{ kind: "asset", id: id(1) }, { kind: "client_field", id: "logo" }, { kind: "asset", id: id(99) }] as const) {
      write.mockResolvedValueOnce(ok(answer({ sourceRefs: [ref as never] })));
      expect(await run()).toMatchObject({ ok: false, error: { code: "INVALID_SOURCE_REF", retryable: false } });
    }
  });

  it("an empty, missing or too-long text is LLM_OUTPUT_INVALID, retryable", async () => {
    write.mockResolvedValueOnce(ok(answer({ text: "   " })));
    expect(await run()).toMatchObject({ ok: false, error: { code: "LLM_OUTPUT_INVALID", retryable: true } });
    write.mockResolvedValueOnce(ok(answer({ text: "x".repeat(CLIENT_INTRO_TEXT_LIMITS.introHead + 1) })));
    expect(await run()).toMatchObject({ ok: false, error: { code: "LLM_OUTPUT_INVALID", retryable: true } });
    const missing = answer();
    delete (missing.texts as Partial<ClientIntroResult["texts"]>).outroHead;
    write.mockResolvedValueOnce(ok(missing));
    expect(await run()).toMatchObject({ ok: false, error: { code: "LLM_OUTPUT_INVALID", retryable: true } });
  });

  it("two equal texts (after trimming) are LLM_OUTPUT_INVALID, retryable: on the pages they would take each other's refs", async () => {
    const twins = answer();
    twins.texts.outroHead = { ...twins.texts.outroHead, text: ` ${twins.texts.introHead.text} ` };
    write.mockResolvedValueOnce(ok(twins));
    expect(await run()).toMatchObject({ ok: false, error: { code: "LLM_OUTPUT_INVALID", retryable: true } });
  });

  it("the writer's failures keep their code: an outage is retryable, a refusal or a rejected request final", async () => {
    for (const [code, retryable] of [
      ["LLM_UNAVAILABLE", true],
      ["LLM_TRUNCATED", true],
      ["LLM_REFUSAL", false],
      ["LLM_REQUEST_REJECTED", false],
    ] as const) {
      write.mockResolvedValueOnce(err({ code, message: "m" }));
      expect(await run()).toMatchObject({ ok: false, error: { code, retryable } });
    }
  });
});

describe("the client test text source (no key)", () => {
  it("is Story 3.11's marked test text with null meta, and reads no file", async () => {
    const out = await clientTestTextSource.texts({ clientId: CLIENT_ID, client: fullClient, assets });
    expect(out.ok && out.value.meta).toEqual({ model: null, fellBack: false, promptVersion: null });
    expect(out.ok && out.value.texts.introBody.text).toContain("[bozza di prova] Il cliente in breve:");
  });
});
