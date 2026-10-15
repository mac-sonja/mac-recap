// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResult } from "@/app/(tool)/case-studies/actions";
import type { Asset, ListedAsset, PresignedAssetUpload } from "@/modules/material";

const presignAssetUpload = vi.fn<(input: unknown) => Promise<ActionResult<PresignedAssetUpload>>>();
const confirmAssetUpload = vi.fn<(input: unknown) => Promise<ActionResult<Asset>>>();
const listAssets = vi.fn<(input: unknown) => Promise<ActionResult<ListedAsset[]>>>();
const removeAsset = vi.fn<(input: unknown) => Promise<ActionResult<void>>>();
const setAssetFavourite = vi.fn<(input: unknown) => Promise<ActionResult<void>>>();
type Target = { url: string; method: "PUT"; headers: Record<string, string> };
const uploadFile = vi.fn<(target: Target, file: Blob, onProgress: (p: number) => void, opts?: { signal?: AbortSignal }) => Promise<void>>();

vi.mock("@/app/(tool)/case-studies/actions", () => ({
  presignAssetUpload: (input: unknown) => presignAssetUpload(input),
  confirmAssetUpload: (input: unknown) => confirmAssetUpload(input),
  listAssets: (input: unknown) => listAssets(input),
  removeAsset: (input: unknown) => removeAsset(input),
  setAssetFavourite: (input: unknown) => setAssetFavourite(input),
}));
vi.mock("../_lib/upload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../_lib/upload")>()),
  uploadFile: (...args: Parameters<typeof uploadFile>) => uploadFile(...args),
}));

const { MaterialStep } = await import("./material-step");
const { UploadError } = await import("../_lib/upload");

const CASE_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const MB = 1024 * 1024;
const ALLOWED = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function makeFile(name: string, type: string, size = 1024): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

const kindOf = (type: string): Asset["kind"] =>
  type.startsWith("image/") ? "image" : type.startsWith("video/") ? "video" : type.startsWith("text/") ? "text" : "document";

function listed(n: number, over: Partial<ListedAsset> = {}): ListedAsset {
  return {
    id: `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, "0")}`,
    kind: "image",
    originalFileName: `file-${n}.png`,
    contentType: "image/png",
    sizeBytes: 2.8 * MB,
    createdAt: "2026-10-14T10:00:00+00:00",
    isFavourite: false,
    thumbnailUrl: null,
    ...over,
  };
}

let issued = 0;
const fail = (code: string, status = 500) => ({ ok: false as const, status, error: { code, message: code } });

beforeEach(() => {
  issued = 0;
  for (const fn of [presignAssetUpload, confirmAssetUpload, listAssets, removeAsset, setAssetFavourite, uploadFile]) fn.mockReset();
  presignAssetUpload.mockImplementation(async () => {
    issued += 1;
    return {
      ok: true,
      value: { assetId: `asset-${issued}`, url: `https://storage.test/sign/k${issued}`, method: "PUT", headers: { "content-type": "image/png", "x-upsert": "false" } },
    };
  });
  uploadFile.mockImplementation(async (_target, _file, onProgress) => onProgress(100));
  confirmAssetUpload.mockImplementation(async (input) => {
    const { assetId, contentType, fileName } = input as { assetId: string; contentType: Asset["contentType"]; fileName: string };
    return {
      ok: true,
      value: {
        id: assetId,
        caseId: CASE_ID,
        kind: kindOf(contentType),
        originalFileName: fileName,
        contentType,
        sizeBytes: 1024,
        createdBy: "00000000-0000-4000-8000-000000000002",
        createdAt: "2026-10-14T10:00:00+00:00",
        deletedAt: null,
        isFavourite: false,
      },
    };
  });
  listAssets.mockResolvedValue({ ok: true, value: [] });
  removeAsset.mockResolvedValue({ ok: true, value: undefined });
  setAssetFavourite.mockResolvedValue({ ok: true, value: undefined });
});

afterEach(cleanup);

function setup(initialAssets: ListedAsset[] = [], { maxAssets = 20, maxFileBytes = 50 * MB } = {}) {
  const user = userEvent.setup({ applyAccept: false });
  const view = render(
    <MaterialStep caseId={CASE_ID} initialAssets={initialAssets} maxAssets={maxAssets} maxFileBytes={maxFileBytes} allowedContentTypes={ALLOWED} />,
  );
  const input = view.container.querySelector<HTMLInputElement>('input[type="file"]');
  if (input === null) throw new Error("no file input");
  return { user, input, ...view };
}

const dropZone = () => screen.getByRole("button", { name: "Trascina qui i file o sfoglia" });
const rowOf = (name: string) => {
  const row = screen.getByText(name).closest("li");
  if (row === null) throw new Error(`no row for ${name}`);
  return row;
};
const liveRegion = () => screen.getByRole("status");
const avanti = () => screen.getByText("Avanti");

/** A promise the test settles by hand. */
function deferred<T = void>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("MaterialStep: empty", () => {
  it("shows heading (no intro), drop zone with chips and hint; Avanti inactive with its reason; no list", () => {
    setup();
    expect(screen.getByRole("heading", { level: 2, name: "Aggiungi il materiale del progetto" })).toBeTruthy();
    expect(screen.queryByText(/Carica il materiale già verificato/)).toBeNull();
    expect(dropZone().getAttribute("tabindex")).toBe("0");
    expect(screen.getByText("sfoglia").className).toContain("text-primary");
    expect(screen.getByText("Fino a 20 file, 50 MB ciascuno.")).toBeTruthy();
    for (const chip of ["PDF", "DOCX", "TXT / MD", "PNG / JPG / WEBP", "MP4 / MOV"]) expect(screen.getByText(chip)).toBeTruthy();
    const button = avanti();
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(document.getElementById(button.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "Aggiungi almeno un file per continuare.",
    );
    expect(screen.queryByText("Materiale")).toBeNull();
    expect(screen.queryByRole("list", { name: "Materiale" })).toBeNull();
  });

  it("opens the file picker from the drop zone with Enter, Space and a click", async () => {
    const { user, input } = setup();
    const click = vi.spyOn(input, "click").mockImplementation(() => undefined);
    dropZone().focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    await user.click(dropZone());
    expect(click).toHaveBeenCalledTimes(3);
    expect(input.multiple).toBe(true);
    expect(input.accept).toContain(".md");
  });
});

describe("MaterialStep: uploads", () => {
  it("uploads 3 files in parallel with per-file progress, then lists them; count 3 / 20; Avanti goes to step 2", async () => {
    const gates = [deferred(), deferred(), deferred()];
    let call = 0;
    uploadFile.mockImplementation((_target, _file, onProgress) => {
      onProgress(40);
      return gates[call++].promise;
    });
    const { user, input } = setup();
    await user.upload(input, [
      makeFile("key.png", "image/png", 4.2 * MB),
      makeFile("spot.mp4", "video/mp4", 30 * MB),
      makeFile("brief.pdf", "application/pdf"),
    ]);

    await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(3));
    const bars = screen.getAllByRole("progressbar");
    expect(bars.map((bar) => bar.getAttribute("aria-label"))).toEqual([
      "Caricamento di key.png",
      "Caricamento di spot.mp4",
      "Caricamento di brief.pdf",
    ]);
    expect(bars.every((bar) => bar.getAttribute("aria-valuenow") === "40")).toBe(true);
    expect(screen.getAllByText("40%")).toHaveLength(3);
    expect(liveRegion().getAttribute("aria-live")).toBe("polite");
    expect(liveRegion().textContent).toContain("Caricamento di key.png in corso.");
    expect(avanti().tagName).toBe("BUTTON");

    expect(presignAssetUpload).toHaveBeenCalledWith({ caseId: CASE_ID, contentType: "image/png", sizeBytes: 4.2 * MB });
    expect(uploadFile.mock.calls[0][0]).toEqual({
      url: "https://storage.test/sign/k1",
      method: "PUT",
      headers: { "content-type": "image/png", "x-upsert": "false" },
    });

    await act(async () => gates.forEach((gate) => gate.resolve()));
    await waitFor(() => expect(screen.queryAllByRole("progressbar")).toHaveLength(0));
    expect(confirmAssetUpload).toHaveBeenCalledWith({ caseId: CASE_ID, assetId: "asset-1", contentType: "image/png", fileName: "key.png" });
    expect(screen.getByText("3 / 20 file")).toBeTruthy();
    const link = avanti();
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe(`/case-studies/new?caseId=${CASE_ID}&step=2`);
    expect(screen.queryByText(/I preferiti sono facoltativi/)).toBeNull();
    expect(liveRegion().textContent).toContain("key.png caricato.");
    // The image's thumbnail is refreshed from the listing.
    expect(listAssets).toHaveBeenCalledWith({ caseId: CASE_ID });
  });

  it("shows the thumbnail from the listing once an image is confirmed", async () => {
    listAssets.mockResolvedValue({ ok: true, value: [listed(1, { id: "asset-1", thumbnailUrl: "https://storage.test/t1" })] });
    const { user, input } = setup();
    await user.upload(input, makeFile("key.png", "image/png"));
    await waitFor(() => expect(rowOf("key.png").querySelector("img")?.getAttribute("src")).toBe("https://storage.test/t1"));
    expect(rowOf("key.png").querySelector("img")?.getAttribute("alt")).toBe("");
  });

  it("declares a normalized content type: .md typed as empty is text/markdown", async () => {
    const { user, input } = setup();
    await user.upload(input, makeFile("notes.md", ""));
    await waitFor(() => expect(confirmAssetUpload).toHaveBeenCalled());
    expect(presignAssetUpload).toHaveBeenCalledWith(expect.objectContaining({ contentType: "text/markdown" }));
    expect(confirmAssetUpload).toHaveBeenCalledWith(expect.objectContaining({ contentType: "text/markdown" }));
  });

  it("keeps the drag highlight while moving onto a child, and clears it on leaving the zone", () => {
    setup();
    const child = screen.getByText("sfoglia");
    fireEvent.dragEnter(dropZone());
    fireEvent.dragOver(dropZone(), { dataTransfer: { files: [], dropEffect: "none" } });
    // Moving onto the link: enter on the child, then leave from the zone (both bubble to it).
    fireEvent.dragEnter(child);
    fireEvent.dragLeave(dropZone());
    expect(dropZone().hasAttribute("data-drag-over")).toBe(true);
    fireEvent.dragLeave(child);
    expect(dropZone().hasAttribute("data-drag-over")).toBe(false);
  });

  it("accepts files dropped on the drop zone", async () => {
    setup();
    fireEvent.dragOver(dropZone(), { dataTransfer: { files: [], dropEffect: "none" } });
    expect(dropZone().hasAttribute("data-drag-over")).toBe(true);
    fireEvent.drop(dropZone(), { dataTransfer: { files: [makeFile("a.pdf", "application/pdf")] } });
    await screen.findByText("1 / 20 file");
    expect(dropZone().hasAttribute("data-drag-over")).toBe(false);
  });

  it("rejects a file over 50 MB on its row and uploads the others", async () => {
    const { user, input } = setup();
    await user.upload(input, [makeFile("backstage-raw.mov", "video/quicktime", 140 * MB), makeFile("a.pdf", "application/pdf")]);
    expect(within(rowOf("backstage-raw.mov")).getByText("Oltre 50 MB. Non caricato.")).toBeTruthy();
    expect(liveRegion().textContent).toContain("backstage-raw.mov: Oltre 50 MB. Non caricato.");
    await screen.findByText("1 / 20 file");
    expect(presignAssetUpload).toHaveBeenCalledOnce();
    expect(presignAssetUpload).toHaveBeenCalledWith(expect.objectContaining({ contentType: "application/pdf" }));
  });

  it("rejects an unsupported type inline and sends nothing", async () => {
    const { user, input } = setup();
    await user.upload(input, makeFile("archive.zip", "application/zip"));
    const message = "Questo tipo di file non è supportato. Usa immagini, video, testi o PDF.";
    expect(within(rowOf("archive.zip")).getByText(message)).toBeTruthy();
    expect(liveRegion().textContent).toBe(`archive.zip: ${message}`);
    expect(presignAssetUpload).not.toHaveBeenCalled();
    expect(screen.getByText("0 / 20 file")).toBeTruthy();
    expect(avanti().tagName).toBe("BUTTON");
  });

  it("with 18 live files uploads 2 of 4 dropped and shows the 20-file message on the other 2", async () => {
    const initial = Array.from({ length: 18 }, (_, i) => listed(i + 1, { kind: "document", contentType: "application/pdf", originalFileName: `doc-${i + 1}.pdf` }));
    const { user, input } = setup(initial);
    await user.upload(input, ["a", "b", "c", "d"].map((n) => makeFile(`${n}.pdf`, "application/pdf")));
    await screen.findByText("20 / 20 file");
    expect(presignAssetUpload).toHaveBeenCalledTimes(2);
    expect(within(rowOf("c.pdf")).getByText("Limite di 20 file raggiunto. Non caricato.")).toBeTruthy();
    expect(within(rowOf("d.pdf")).getByText("Limite di 20 file raggiunto. Non caricato.")).toBeTruthy();
  });

  it("counts uploads in flight against the slots of a later drop", async () => {
    const gate = deferred();
    uploadFile.mockImplementation(() => gate.promise);
    const initial = Array.from({ length: 19 }, (_, i) => listed(i + 1, { kind: "document", contentType: "application/pdf", originalFileName: `doc-${i + 1}.pdf` }));
    const { user, input } = setup(initial);
    await user.upload(input, makeFile("a.pdf", "application/pdf"));
    await user.upload(input, makeFile("b.pdf", "application/pdf"));
    expect(within(rowOf("b.pdf")).getByText("Limite di 20 file raggiunto. Non caricato.")).toBeTruthy();
    await act(async () => gate.resolve());
    expect(presignAssetUpload).toHaveBeenCalledOnce();
  });

  it.each([
    ["presign", "FILE_LIMIT_REACHED", "Limite di 20 file raggiunto. Non caricato."],
    ["presign", "FILE_TOO_LARGE", "Oltre 50 MB. Non caricato."],
    ["presign", "FILE_TYPE_NOT_ALLOWED", "Questo tipo di file non è supportato. Usa immagini, video, testi o PDF."],
    ["confirm", "FILE_LIMIT_REACHED", "Limite di 20 file raggiunto. Non caricato."],
    ["confirm", "UPLOAD_REJECTED", "Il file caricato non corrisponde a quello scelto. Non caricato."],
  ])("on a %s %s shows the matching message on the row, without retrying", async (step, code, message) => {
    if (step === "presign") presignAssetUpload.mockResolvedValue(fail(code, 400));
    else confirmAssetUpload.mockResolvedValue(fail(code, 409));
    const { user, input } = setup();
    await user.upload(input, makeFile("a.pdf", "application/pdf"));
    expect(await within(rowOf("a.pdf")).findByText(message)).toBeTruthy();
    expect(presignAssetUpload).toHaveBeenCalledOnce();
    expect(liveRegion().lastElementChild?.textContent).toBe(`a.pdf: ${message}`);
  });

  it("keeps uploading the other files when one is rejected by the server", async () => {
    presignAssetUpload.mockImplementationOnce(async () => fail("FILE_TOO_LARGE", 400));
    const { user, input } = setup();
    await user.upload(input, [makeFile("a.pdf", "application/pdf"), makeFile("b.pdf", "application/pdf")]);
    await screen.findByText("1 / 20 file");
    expect(within(rowOf("a.pdf")).getByText("Oltre 50 MB. Non caricato.")).toBeTruthy();
    expect(rowOf("b.pdf").getAttribute("data-row-state")).toBe("listed");
  });

  it("re-presigns and retries once when the storage upload fails, then lists the file", async () => {
    uploadFile.mockRejectedValueOnce(new UploadError("Network error.", 0));
    const { user, input } = setup();
    await user.upload(input, makeFile("a.pdf", "application/pdf"));
    await screen.findByText("1 / 20 file");
    expect(presignAssetUpload).toHaveBeenCalledTimes(2);
    expect(confirmAssetUpload).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ assetId: "asset-2" }));
  });

  it.each([
    ["404", () => Promise.resolve(fail("UPLOAD_NOT_FOUND", 404))],
    ["500", () => Promise.resolve(fail("STORAGE_FAILED", 500))],
    ["throws", () => Promise.reject(new Error("network"))],
  ])("re-presigns with a new assetId when confirm %s", async (_label, firstConfirm) => {
    const original = confirmAssetUpload.getMockImplementation();
    confirmAssetUpload.mockImplementationOnce(firstConfirm as () => Promise<ActionResult<Asset>>);
    if (original) confirmAssetUpload.mockImplementation(original);
    const { user, input } = setup();
    await user.upload(input, makeFile("a.pdf", "application/pdf"));
    await screen.findByText("1 / 20 file");
    expect(confirmAssetUpload.mock.calls.map(([call]) => (call as { assetId: string }).assetId)).toEqual(["asset-1", "asset-2"]);
  });

  it.each([
    ["throws", () => Promise.reject(new Error("network"))],
    ["answers 500", () => Promise.resolve(fail("ASSET_WRITE_FAILED", 500))],
  ])("when confirm %s but the asset was stored, uses the listed row instead of uploading again", async (_label, firstConfirm) => {
    confirmAssetUpload.mockImplementationOnce(firstConfirm as () => Promise<ActionResult<Asset>>);
    listAssets.mockResolvedValue({
      ok: true,
      value: [listed(1, { id: "asset-1", kind: "document", contentType: "application/pdf", originalFileName: "a.pdf", sizeBytes: 1024 })],
    });
    const { user, input } = setup();
    await user.upload(input, makeFile("a.pdf", "application/pdf"));
    await screen.findByText("1 / 20 file");
    expect(listAssets).toHaveBeenCalledWith({ caseId: CASE_ID });
    expect(presignAssetUpload).toHaveBeenCalledOnce();
    expect(confirmAssetUpload).toHaveBeenCalledOnce();
    expect(rowOf("a.pdf").getAttribute("data-row-state")).toBe("listed");
  });

  it("does not check the listing after a confirm 404: nothing was stored", async () => {
    confirmAssetUpload.mockImplementationOnce(() => Promise.resolve(fail("UPLOAD_NOT_FOUND", 404)));
    const { user, input } = setup();
    await user.upload(input, makeFile("a.pdf", "application/pdf"));
    await screen.findByText("1 / 20 file");
    expect(listAssets).not.toHaveBeenCalled();
    expect(presignAssetUpload).toHaveBeenCalledTimes(2);
  });

  it("refuses a 0-byte file on its row, announced, without presigning", async () => {
    const { user, input } = setup();
    await user.upload(input, makeFile("empty.pdf", "application/pdf", 0));
    expect(within(rowOf("empty.pdf")).getByText("Caricamento non riuscito.")).toBeTruthy();
    expect(liveRegion().textContent).toBe("empty.pdf: Caricamento non riuscito.");
    expect(presignAssetUpload).not.toHaveBeenCalled();
  });

  it("keeps only the last 5 live-region lines", async () => {
    const { user, input } = setup();
    for (let i = 1; i <= 7; i++) await user.upload(input, makeFile(`f${i}.zip`, "application/zip"));
    const lines = [...liveRegion().children].map((line) => line.textContent ?? "");
    expect(lines).toHaveLength(5);
    expect(lines[0]).toMatch(/^f3\.zip: /);
    expect(lines[4]).toMatch(/^f7\.zip: /);
  });

  it("fills the size and file-count limits into the rejection lines from its props", async () => {
    const { user, input } = setup([], { maxAssets: 1, maxFileBytes: 10 * MB });
    await user.upload(input, [
      makeFile("big.pdf", "application/pdf", 11 * MB),
      makeFile("a.pdf", "application/pdf"),
      makeFile("b.pdf", "application/pdf"),
    ]);
    expect(within(rowOf("big.pdf")).getByText("Oltre 10 MB. Non caricato.")).toBeTruthy();
    expect(within(rowOf("b.pdf")).getByText("Limite di 1 file raggiunto. Non caricato.")).toBeTruthy();
    expect(screen.getByText("Fino a 1 file, 10 MB ciascuno. PDF, DOCX, TXT / MD, PNG / JPG / WEBP, MP4 / MOV.")).toBeTruthy();
  });

  it("aborts uploads still running when the step unmounts", async () => {
    const signals: AbortSignal[] = [];
    uploadFile.mockImplementation((_target, _file, _onProgress, opts) => {
      if (opts?.signal) signals.push(opts.signal);
      return new Promise(() => undefined);
    });
    const { user, input, unmount } = setup();
    await user.upload(input, [makeFile("a.pdf", "application/pdf"), makeFile("b.pdf", "application/pdf")]);
    await waitFor(() => expect(signals).toHaveLength(2));
    unmount();
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it("removes a file again when its row was removed while confirm was running", async () => {
    const confirmed = deferred<ActionResult<Asset>>();
    const original = confirmAssetUpload.getMockImplementation();
    confirmAssetUpload.mockImplementationOnce(async (input) => {
      const value = await original!(input);
      await confirmed.promise;
      return value;
    });
    const { user, input } = setup();
    await user.upload(input, makeFile("a.pdf", "application/pdf"));
    await waitFor(() => expect(confirmAssetUpload).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Rimuovi a.pdf" }));
    expect(screen.queryByText("a.pdf")).toBeNull();
    await act(async () => confirmed.resolve({ ok: true, value: undefined as never }));
    await waitFor(() => expect(removeAsset).toHaveBeenCalledExactlyOnceWith({ caseId: CASE_ID, assetId: "asset-1" }));
    await act(async () => undefined);
    expect(screen.queryByText("a.pdf")).toBeNull();
  });

  it("shows the stored file with the remove error when that clean-up remove fails", async () => {
    const confirmed = deferred();
    const original = confirmAssetUpload.getMockImplementation();
    confirmAssetUpload.mockImplementationOnce(async (input) => {
      const value = await original!(input);
      await confirmed.promise;
      return value;
    });
    removeAsset.mockResolvedValue(fail("ASSET_WRITE_FAILED"));
    const { user, input } = setup();
    await user.upload(input, makeFile("a.pdf", "application/pdf"));
    await waitFor(() => expect(confirmAssetUpload).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Rimuovi a.pdf" }));
    await act(async () => confirmed.resolve());
    expect(await within(rowOf("a.pdf")).findByText("Non è stato possibile rimuovere il file. Riprova.")).toBeTruthy();
    expect(rowOf("a.pdf").getAttribute("data-row-state")).toBe("listed");
    expect(screen.getByText("1 / 20 file")).toBeTruthy();
  });

  it("shows Caricamento non riuscito. after the retry fails too", async () => {
    uploadFile.mockRejectedValue(new UploadError("Storage answered 500.", 500));
    const { user, input } = setup();
    await user.upload(input, makeFile("a.pdf", "application/pdf"));
    expect(await within(rowOf("a.pdf")).findByText("Caricamento non riuscito.")).toBeTruthy();
    expect(presignAssetUpload).toHaveBeenCalledTimes(2);
    expect(confirmAssetUpload).not.toHaveBeenCalled();
    expect(liveRegion().lastElementChild?.textContent).toBe("a.pdf: Caricamento non riuscito.");
    expect(avanti().tagName).toBe("BUTTON");
  });

  it("on STORAGE_NOT_CONFIGURED shows one message above the drop zone and turns it off", async () => {
    presignAssetUpload.mockResolvedValue(fail("STORAGE_NOT_CONFIGURED", 503));
    const { user, input } = setup();
    await user.upload(input, [makeFile("a.pdf", "application/pdf"), makeFile("b.pdf", "application/pdf")]);
    const alert = screen.getByRole("alert");
    await waitFor(() => expect(alert.textContent).toContain("lo spazio di archiviazione non è configurato"));
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(alert.compareDocumentPosition(dropZone()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(dropZone().getAttribute("aria-disabled")).toBe("true");
    expect(dropZone().getAttribute("tabindex")).toBe("-1");
    await waitFor(() => expect(screen.queryByText("a.pdf")).toBeNull());
    expect(screen.queryByText("b.pdf")).toBeNull();

    fireEvent.drop(dropZone(), { dataTransfer: { files: [makeFile("c.pdf", "application/pdf")] } });
    expect(screen.queryByText("c.pdf")).toBeNull();
    expect(presignAssetUpload).toHaveBeenCalledTimes(2);
  });

  it("cancels an upload in flight when its row is removed", async () => {
    uploadFile.mockImplementation(
      (_target, _file, _onProgress, opts) =>
        new Promise((_resolve, reject) =>
          opts?.signal?.addEventListener("abort", () => reject(new UploadError("Upload aborted.", 0, true))),
        ),
    );
    const { user, input } = setup();
    await user.upload(input, makeFile("a.pdf", "application/pdf"));
    await waitFor(() => expect(uploadFile).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Rimuovi a.pdf" }));
    expect(screen.queryByText("a.pdf")).toBeNull();
    await act(async () => undefined);
    expect(confirmAssetUpload).not.toHaveBeenCalled();
    expect(presignAssetUpload).toHaveBeenCalledOnce();
  });

  it("dismisses a rejected row with its ✕", async () => {
    const { user, input } = setup();
    await user.upload(input, makeFile("archive.zip", "application/zip"));
    await user.click(screen.getByRole("button", { name: "Rimuovi archive.zip" }));
    expect(screen.queryByText("archive.zip")).toBeNull();
    expect(removeAsset).not.toHaveBeenCalled();
  });
});

describe("MaterialStep: listed rows", () => {
  const image = listed(1, { originalFileName: "lumen-keyvisual-final.png", sizeBytes: 4.2 * MB, thumbnailUrl: "https://storage.test/t1" });
  const video = listed(2, { kind: "video", contentType: "video/mp4", originalFileName: "spot.mp4", isFavourite: true });
  const docs = [
    listed(3, { kind: "document", contentType: "application/pdf", originalFileName: "guide.pdf", sizeBytes: 11.6 * MB }),
    listed(4, { kind: "document", contentType: DOCX, originalFileName: "brief.docx" }),
    listed(5, { kind: "text", contentType: "text/plain", originalFileName: "notes.txt" }),
    listed(6, { kind: "text", contentType: "text/markdown", originalFileName: "notes.md" }),
  ];

  it("lists reopened files oldest first with thumbnail or type icon, name and size in mono", () => {
    setup([image, video, ...docs]);
    const items = within(screen.getByRole("list", { name: "Materiale" })).getAllByRole("listitem");
    expect(items.map((item) => item.querySelector(".truncate")?.textContent)).toEqual([
      "lumen-keyvisual-final.png",
      "spot.mp4",
      "guide.pdf",
      "brief.docx",
      "notes.txt",
      "notes.md",
    ]);
    expect(items[0].querySelector("img")?.getAttribute("src")).toBe("https://storage.test/t1");
    expect(items[1].querySelector("img")).toBeNull();
    expect(items[1].querySelector("svg")).not.toBeNull();
    const size = within(items[0]).getByText("4,2 MB");
    expect(size.className).toContain("font-mono");
    expect(within(items[2]).getByText("11,6 MB")).toBeTruthy();
    expect(screen.getByText("6 / 20 file")).toBeTruthy();
    expect(avanti().tagName).toBe("A");
  });

  it("falls back to the type icon when a thumbnail fails to load", () => {
    setup([image]);
    const img = rowOf("lumen-keyvisual-final.png").querySelector("img");
    expect(img).not.toBeNull();
    fireEvent.error(img as HTMLImageElement);
    expect(rowOf("lumen-keyvisual-final.png").querySelector("img")).toBeNull();
    expect(rowOf("lumen-keyvisual-final.png").querySelector("svg.lucide-file")).not.toBeNull();
  });

  it("describes each Preferito toggle by its file name", () => {
    setup([image, video]);
    const toggles = screen.getAllByRole("button", { name: "Preferito" });
    expect(toggles.map((toggle) => document.getElementById(toggle.getAttribute("aria-describedby") ?? "")?.textContent)).toEqual([
      "lumen-keyvisual-final.png",
      "spot.mp4",
    ]);
  });

  it("still removes a row while its favourite is saving", async () => {
    setAssetFavourite.mockReturnValue(new Promise(() => undefined));
    const { user } = setup([image]);
    await user.click(screen.getByRole("button", { name: "Preferito" }));
    await user.click(screen.getByRole("button", { name: "Rimuovi lumen-keyvisual-final.png" }));
    expect(screen.queryByText("lumen-keyvisual-final.png")).toBeNull();
    expect(removeAsset).toHaveBeenCalledExactlyOnceWith({ caseId: CASE_ID, assetId: image.id });
  });

  it("puts Preferito on images and videos only", () => {
    setup([image, video, ...docs]);
    expect(within(rowOf("lumen-keyvisual-final.png")).getByRole("button", { name: "Preferito" }).getAttribute("aria-pressed")).toBe("false");
    expect(within(rowOf("spot.mp4")).getByRole("button", { name: "Preferito" }).getAttribute("aria-pressed")).toBe("true");
    for (const name of ["guide.pdf", "brief.docx", "notes.txt", "notes.md"]) {
      expect(within(rowOf(name)).queryByRole("button", { name: "Preferito" })).toBeNull();
    }
  });

  it("flips Preferito at once and saves it", async () => {
    const saved = deferred<ActionResult<void>>();
    setAssetFavourite.mockReturnValue(saved.promise);
    const user = userEvent.setup();
    render(<MaterialStep caseId={CASE_ID} initialAssets={[image]} maxAssets={20} maxFileBytes={50 * MB} allowedContentTypes={ALLOWED} />);
    const toggle = screen.getByRole("button", { name: "Preferito" });
    await user.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(setAssetFavourite).toHaveBeenCalledExactlyOnceWith({ caseId: CASE_ID, assetId: image.id, isFavourite: true });
    // A second press while saving sends nothing.
    await user.click(toggle);
    expect(setAssetFavourite).toHaveBeenCalledOnce();
    await act(async () => saved.resolve({ ok: true, value: undefined }));
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
  });

  it.each([
    ["fails", () => Promise.resolve(fail("ASSET_WRITE_FAILED"))],
    ["throws", () => Promise.reject(new Error("network"))],
  ])("flips Preferito back with a row message when saving %s", async (_label, outcome) => {
    setAssetFavourite.mockImplementation(outcome as () => Promise<ActionResult<void>>);
    const { user } = setup([video]);
    const toggle = screen.getByRole("button", { name: "Preferito" });
    await user.click(toggle);
    await waitFor(() => expect(toggle.getAttribute("aria-pressed")).toBe("true"));
    expect(setAssetFavourite).toHaveBeenCalledWith({ caseId: CASE_ID, assetId: video.id, isFavourite: false });
    expect(within(rowOf("spot.mp4")).getByText("Non è stato possibile salvare il preferito. Riprova.")).toBeTruthy();
  });

  it("removes a row at once, with no undo", async () => {
    const removed = deferred<ActionResult<void>>();
    removeAsset.mockReturnValue(removed.promise);
    const { user } = setup([image, docs[0]]);
    await user.click(screen.getByRole("button", { name: "Rimuovi guide.pdf" }));
    expect(screen.queryByText("guide.pdf")).toBeNull();
    expect(screen.getByText("1 / 20 file")).toBeTruthy();
    expect(removeAsset).toHaveBeenCalledExactlyOnceWith({ caseId: CASE_ID, assetId: docs[0].id });
    expect(liveRegion().lastElementChild?.textContent).toBe("guide.pdf rimosso.");
    await act(async () => removed.resolve({ ok: true, value: undefined }));
    expect(screen.queryByText("guide.pdf")).toBeNull();
    expect(screen.queryByText(/annulla/i)).toBeNull();
  });

  it("brings a removed row back in place with a message when removing fails", async () => {
    removeAsset.mockResolvedValue(fail("ASSET_WRITE_FAILED"));
    const { user } = setup([image, docs[0], docs[1]]);
    await user.click(screen.getByRole("button", { name: "Rimuovi guide.pdf" }));
    expect(await within(rowOf("guide.pdf")).findByText("Non è stato possibile rimuovere il file. Riprova.")).toBeTruthy();
    const items = within(screen.getByRole("list", { name: "Materiale" })).getAllByRole("listitem");
    expect(items.map((item) => item.querySelector(".truncate")?.textContent)).toEqual([
      "lumen-keyvisual-final.png",
      "guide.pdf",
      "brief.docx",
    ]);
  });

  it("treats NOT_FOUND on remove as already removed", async () => {
    removeAsset.mockResolvedValue(fail("NOT_FOUND", 404));
    const { user } = setup([docs[0]]);
    await user.click(screen.getByRole("button", { name: "Rimuovi guide.pdf" }));
    await act(async () => undefined);
    expect(screen.queryByText("guide.pdf")).toBeNull();
  });

  it("makes Avanti inactive again when the last file is removed", async () => {
    const { user } = setup([docs[0]]);
    expect(avanti().tagName).toBe("A");
    await user.click(screen.getByRole("button", { name: "Rimuovi guide.pdf" }));
    expect(avanti().tagName).toBe("BUTTON");
    expect(avanti().getAttribute("aria-disabled")).toBe("true");
  });
});
