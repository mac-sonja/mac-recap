import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeNarrativeTextSource, MAX_IMAGE_BYTES, MAX_IMAGES, MAX_PDF_PAGES, REQUEST_BUDGET_BYTES, type NarrativeSourceDeps } from "@/modules/generation/application/narrative-text-source";
import type { SourceAsset } from "@/modules/generation/application/text-source";
import type { NarrativeRequest, NarrativeResult, NarrativeText } from "@/modules/generation/ports/narrative-generator";
import { FORMAT_IDS, TEMPLATE_TEXT_KEYS } from "@/modules/rendering";
import { err, ok } from "@/shared/result";

const CASE_ID = "11111111-1111-4111-8111-111111111111";
const id = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;
const asset = (n: number, contentType: string, kind: SourceAsset["kind"], isFavourite = false): SourceAsset => ({ id: id(n), contentType, kind, sizeBytes: 10, isFavourite });
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const form = { context: "Sfida dal modulo", solution: "Idea dal modulo", results: [{ label: "Visite", value: "+40%" }], testimonialQuote: "" };

/** Every key in every format, citing the first asset, the technical side in Presentazione and the graphic side in Carosello. */
function answer(over: Partial<NarrativeText> = {}): NarrativeResult {
  const text = (formatId: string, key: string): NarrativeText => ({
    text: `${formatId} ${key}`,
    sourceRefs: [{ kind: "asset", id: id(1) }],
    ...(formatId === "presentazione_16_9" ? { aspect: "technical" as const } : formatId === "carosello_1_1" ? { aspect: "graphic" as const } : {}),
    ...over,
  });
  return {
    texts: Object.fromEntries(FORMAT_IDS.map((f) => [f, Object.fromEntries(TEMPLATE_TEXT_KEYS.map((k) => [k, text(f, k)]))])) as NarrativeResult["texts"],
    model: "claude-opus-5-5",
    fellBack: false,
    promptVersion: "case-narrative@1",
  };
}

let write: ReturnType<typeof vi.fn<(r: NarrativeRequest) => Promise<ReturnType<typeof ok<NarrativeResult>> | ReturnType<typeof err>>>>;
let deps: NarrativeSourceDeps;
const sent = () => write.mock.calls[0][0];

beforeEach(() => {
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  write = vi.fn(async () => ok(answer()));
  deps = {
    generator: { write },
    documents: {
      docxText: vi.fn(async () => "Testo del DOCX"),
      pdfPageCount: vi.fn(async () => 4),
      pdfText: vi.fn(async () => "Testo del PDF"),
    },
    readAssetBytes: vi.fn(async ({ variant }) => ok({ bytes: new Uint8Array(30), contentType: variant === "image.display" ? "image/webp" : "application/octet-stream" })),
    getClientInfo: vi.fn(async () =>
      ok({ name: "Helios", industry: { label: "Energia" }, description: "Operatore energetico", brief: { context: "c", solution: "s", results: [] } }),
    ),
  };
});

const run = (assets: SourceAsset[]) => makeNarrativeTextSource(deps).texts({ caseId: CASE_ID, form, assets });

describe("narrative text source: material", () => {
  it("happy path: form, client, a DOCX as text, a PDF whole, images as display copies; meta and per-format texts", async () => {
    const out = await run([asset(1, "image/png", "image"), asset(2, "application/pdf", "document"), asset(3, DOCX, "document"), asset(4, "video/mp4", "video")]);
    expect(out.ok).toBe(true);
    const req = sent();
    expect(req.locale).toBe("it");
    expect(req.form).toEqual({ context: "Sfida dal modulo", solution: "Idea dal modulo", results: [{ label: "Visite", value: "+40%" }] });
    expect(req.client).toMatchObject({ name: "Helios", industry: "Energia" });
    expect(req.documents.map((d) => [d.assetId, d.kind])).toEqual([[id(3), "text"], [id(2), "pdf"]]);
    expect(req.images.map((i) => [i.assetId, i.mediaType])).toEqual([[id(1), "image/webp"]]);
    // The video is never read.
    expect(vi.mocked(deps.readAssetBytes).mock.calls.map((c) => c[0].assetId)).not.toContain(id(4));
    if (!out.ok) return;
    expect(out.value.meta).toEqual({ model: "claude-opus-5-5", fellBack: false, promptVersion: "case-narrative@1" });
    expect(out.value.texts.video_9_16.title).toEqual({ text: "video_9_16 title", sourceRefs: [{ kind: "asset", id: id(1) }] });
    expect(out.value.texts.presentazione_16_9.title.aspect).toBe("technical");
  });

  it("more than 20 images: favourites first, then the oldest others", async () => {
    const images = Array.from({ length: 25 }, (_, i) => asset(i + 1, "image/jpeg", "image", [7, 12, 20].includes(i + 1)));
    await run(images);
    const order = sent().images.map((i) => i.assetId);
    expect(order).toHaveLength(MAX_IMAGES);
    expect(order.slice(0, 3)).toEqual([id(7), id(12), id(20)]);
    expect(order.slice(3)).toEqual([1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19].map(id));
  });

  it("video only: the request has only the form and the client", async () => {
    const out = await run([asset(1, "video/mp4", "video")]);
    expect(out.ok).toBe(true);
    expect(sent().documents).toEqual([]);
    expect(sent().images).toEqual([]);
    expect(deps.readAssetBytes).not.toHaveBeenCalled();
  });

  it("an image whose display copy is not ready, or a removed file, is skipped", async () => {
    vi.mocked(deps.readAssetBytes).mockImplementation(async ({ assetId }) =>
      assetId === id(1) ? err({ code: "RENDITION_NOT_READY", message: "m" }) : assetId === id(2) ? err({ code: "NOT_FOUND", message: "m" }) : ok({ bytes: new Uint8Array(3), contentType: "image/png" }),
    );
    const out = await run([asset(1, "image/png", "image"), asset(2, "application/pdf", "document"), asset(3, "image/png", "image")]);
    expect(out.ok).toBe(true);
    expect(sent().images.map((i) => i.assetId)).toEqual([id(3)]);
    expect(sent().documents).toEqual([]);
  });

  it("an image over the API's 5 MB limit is left out", async () => {
    vi.mocked(deps.readAssetBytes).mockImplementation(async ({ assetId }) =>
      ok({ bytes: new Uint8Array(assetId === id(1) ? MAX_IMAGE_BYTES + 1 : 3), contentType: "image/webp" }),
    );
    await run([asset(1, "image/png", "image"), asset(2, "image/png", "image")]);
    expect(sent().images.map((i) => i.assetId)).toEqual([id(2)]);
  });

  it("whole PDFs stop at the page limit, counted over all PDFs", async () => {
    vi.mocked(deps.documents.pdfPageCount).mockResolvedValue(MAX_PDF_PAGES / 2);
    await run([asset(1, "application/pdf", "document"), asset(2, "application/pdf", "document"), asset(3, "application/pdf", "document")]);
    expect(sent().documents.map((d) => [d.assetId, d.kind])).toEqual([[id(1), "pdf"], [id(2), "pdf"], [id(3), "text"]]);
  });

  it("another read error fails the attempt, retryable", async () => {
    vi.mocked(deps.readAssetBytes).mockResolvedValue(err({ code: "STORAGE_FAILED", message: "m" }));
    expect(await run([asset(1, "image/png", "image")])).toMatchObject({ ok: false, error: { code: "MATERIAL_READ_FAILED", retryable: true } });
    expect(write).not.toHaveBeenCalled();
  });

  it("oversized PDF: over the page limit or the byte budget, it goes as its text", async () => {
    vi.mocked(deps.documents.pdfPageCount).mockResolvedValueOnce(MAX_PDF_PAGES + 1);
    vi.mocked(deps.readAssetBytes).mockImplementation(async ({ assetId }) =>
      ok({ bytes: new Uint8Array(assetId === id(3) ? REQUEST_BUDGET_BYTES : 30), contentType: "application/pdf" }),
    );
    await run([asset(1, "application/pdf", "document"), asset(2, "application/pdf", "document"), asset(3, "application/pdf", "document")]);
    expect(sent().documents.map((d) => [d.assetId, d.kind])).toEqual([[id(1), "text"], [id(2), "pdf"], [id(3), "text"]]);
    expect(deps.documents.pdfText).toHaveBeenCalledTimes(2);
  });

  it("no client (NOT_FOUND) sends none; another lookup error is retryable", async () => {
    vi.mocked(deps.getClientInfo).mockResolvedValueOnce(err({ code: "NOT_FOUND", message: "m" }));
    expect((await run([asset(1, "image/png", "image")])).ok).toBe(true);
    expect(sent().client).toBeNull();
    vi.mocked(deps.getClientInfo).mockResolvedValueOnce(err({ code: "CLIENT_LOOKUP_FAILED", message: "m" }));
    expect(await run([asset(1, "image/png", "image")])).toMatchObject({ ok: false, error: { code: "CLIENT_LOOKUP_FAILED", retryable: true } });
  });
});

describe("narrative text source: the AI's answer", () => {
  it("refusal and a rejected request are final; an outage is retryable", async () => {
    write.mockResolvedValueOnce(err({ code: "LLM_REFUSAL", message: "m" }));
    expect(await run([asset(1, "image/png", "image")])).toMatchObject({ ok: false, error: { code: "LLM_REFUSAL", retryable: false } });
    write.mockResolvedValueOnce(err({ code: "LLM_REQUEST_REJECTED", message: "m" }));
    expect(await run([asset(1, "image/png", "image")])).toMatchObject({ ok: false, error: { code: "LLM_REQUEST_REJECTED", retryable: false } });
    write.mockResolvedValueOnce(err({ code: "LLM_UNAVAILABLE", message: "m" }));
    expect(await run([asset(1, "image/png", "image")])).toMatchObject({ ok: false, error: { code: "LLM_UNAVAILABLE", retryable: true } });
  });

  it("a ref outside the manifest, the form or the client fails with INVALID_SOURCE_REF, not retried", async () => {
    write.mockResolvedValueOnce(ok(answer({ sourceRefs: [{ kind: "asset", id: id(99) }] })));
    expect(await run([asset(1, "image/png", "image")])).toMatchObject({ ok: false, error: { code: "INVALID_SOURCE_REF", retryable: false } });
    vi.mocked(deps.getClientInfo).mockResolvedValueOnce(err({ code: "NOT_FOUND", message: "m" }));
    write.mockResolvedValueOnce(ok(answer({ sourceRefs: [{ kind: "client_field", id: "description" }] })));
    expect(await run([asset(1, "image/png", "image")])).toMatchObject({ ok: false, error: { code: "INVALID_SOURCE_REF" } });
  });

  it("client refs are allowed but never become document refs; refs are deduplicated", async () => {
    write.mockResolvedValueOnce(
      ok(answer({ sourceRefs: [{ kind: "client_field", id: "description" }, { kind: "form_field", id: "context" }, { kind: "form_field", id: "context" }] })),
    );
    const out = await run([asset(1, "image/png", "image")]);
    expect(out.ok && out.value.texts.carosello_1_1.challengeBody.sourceRefs).toEqual([{ kind: "form_field", id: "context" }]);
  });

  it("a key a format does not show takes the Presentazione text; an empty text is invalid", async () => {
    const partial = answer();
    partial.texts.video_9_16 = { title: partial.texts.video_9_16.title, subtitle: partial.texts.video_9_16.subtitle };
    write.mockResolvedValueOnce(ok(partial));
    const out = await run([asset(1, "image/png", "image")]);
    expect(out.ok && out.value.texts.video_9_16.ideaBody.text).toBe("presentazione_16_9 ideaBody");
    write.mockResolvedValueOnce(ok(answer({ text: "  " })));
    expect(await run([asset(1, "image/png", "image")])).toMatchObject({ ok: false, error: { code: "LLM_OUTPUT_INVALID", retryable: true } });
  });
});
