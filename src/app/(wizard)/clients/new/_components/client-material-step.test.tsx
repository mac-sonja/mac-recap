// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResult } from "@/app/_lib/action-result";
import type { ClientMaterialLimits } from "@/app/(tool)/clients/_lib/client-limits";
import type { ListedClientAsset, PresignedClientMaterial } from "@/modules/case-study";

const requestClientMaterialUpload = vi.fn<(input: unknown) => Promise<ActionResult<PresignedClientMaterial>>>();
const confirmClientMaterialUpload = vi.fn<(input: unknown) => Promise<ActionResult<ListedClientAsset>>>();
const listClientMaterial = vi.fn<(input: unknown) => Promise<ActionResult<ListedClientAsset[]>>>();
const removeClientMaterial = vi.fn<(input: unknown) => Promise<ActionResult<void>>>();
const caseAction = vi.fn();
type Target = { url: string; method: "PUT"; headers: Record<string, string> };
const uploadFile = vi.fn<(target: Target, file: Blob, onProgress: (p: number) => void, opts?: { signal?: AbortSignal }) => Promise<void>>();

vi.mock("@/app/(tool)/clients/actions", () => ({
  requestClientMaterialUpload: (input: unknown) => requestClientMaterialUpload(input),
  confirmClientMaterialUpload: (input: unknown) => confirmClientMaterialUpload(input),
  listClientMaterial: (input: unknown) => listClientMaterial(input),
  removeClientMaterial: (input: unknown) => removeClientMaterial(input),
  requestClientLogoUpload: vi.fn(),
  confirmClientLogoUpload: vi.fn(),
}));
// The case actions must never be reached from the client step.
vi.mock("@/app/(tool)/case-studies/actions", () => ({
  presignAssetUpload: caseAction,
  confirmAssetUpload: caseAction,
  listAssets: caseAction,
  removeAsset: caseAction,
  setAssetFavourite: caseAction,
}));
vi.mock("@/app/(wizard)/_lib/upload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/(wizard)/_lib/upload")>()),
  uploadFile: (...args: Parameters<typeof uploadFile>) => uploadFile(...args),
}));

const { ClientMaterialStep } = await import("./client-material-step");

const CLIENT_ID = "cccccccc-0000-4000-8000-000000000001";
const MB = 1024 * 1024;
const LIMITS: ClientMaterialLimits = {
  maxFiles: 3,
  maxFileBytes: 50 * MB,
  contentTypes: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "video/mp4",
    "video/quicktime",
    "application/pdf",
    "text/plain",
    "text/markdown",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  minImages: 2,
  minShortSide: 1600,
  maxSide: 8000,
};
const PIXELS = "Immagine troppo piccola o troppo grande: serve almeno 1600 px sul lato corto e al massimo 8000 px per lato.";

function makeFile(name: string, type: string, size = 1024): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

const kindOf = (type: string): ListedClientAsset["kind"] =>
  type.startsWith("image/") ? "image" : type.startsWith("video/") ? "video" : type.startsWith("text/") ? "text" : "document";

function stored(position: number, over: Partial<ListedClientAsset> = {}): ListedClientAsset {
  return {
    id: `ffffffff-0000-4000-8000-00000000000${position}`,
    clientId: CLIENT_ID,
    position,
    fileName: `foto-${position}.jpg`,
    kind: "image",
    contentType: "image/jpeg",
    sizeBytes: 2 * MB,
    width: 2400,
    height: 1600,
    createdAt: "2026-10-19T10:00:00+00:00",
    thumbnailUrl: null,
    ...over,
  };
}
const pdf = (position: number) =>
  stored(position, { fileName: `brief-${position}.pdf`, kind: "document", contentType: "application/pdf", width: null, height: null });

let issued = 0;
/** Positions the fake confirm has handed out (seeded from the initial files). */
let taken = new Set<number>();
const fail = (code: string, status: number) => ({ ok: false as const, status, error: { code, message: code } });

beforeEach(() => {
  issued = 0;
  taken = new Set();
  for (const fn of [requestClientMaterialUpload, confirmClientMaterialUpload, listClientMaterial, removeClientMaterial, uploadFile, caseAction]) {
    fn.mockReset();
  }
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width: 2400, height: 1600, close: () => undefined })),
  );
  requestClientMaterialUpload.mockImplementation(async (input) => {
    issued += 1;
    const { contentType } = input as { contentType: string };
    return {
      ok: true,
      value: { assetId: `asset-${issued}`, url: `https://storage.test/sign/k${issued}`, method: "PUT", headers: { "content-type": contentType, "x-upsert": "false" } },
    };
  });
  uploadFile.mockImplementation(async (_target, _file, onProgress) => onProgress(100));
  confirmClientMaterialUpload.mockImplementation(async (input) => {
    const { assetId, contentType, fileName } = input as { assetId: string; contentType: ListedClientAsset["contentType"]; fileName: string };
    const kind = kindOf(contentType);
    // Mirrors insert_client_asset: the lowest free position.
    const position = [1, 2, 3].find((p) => !taken.has(p)) ?? 4;
    taken.add(position);
    return {
      ok: true,
      value: stored(position, { id: assetId, fileName, contentType, kind, ...(kind === "image" ? {} : { width: null, height: null }) }),
    };
  });
  listClientMaterial.mockResolvedValue({ ok: true, value: [] });
  removeClientMaterial.mockResolvedValue({ ok: true, value: undefined });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setup(initialAssets: ListedClientAsset[] = []) {
  taken = new Set(initialAssets.map((asset) => asset.position));
  const user = userEvent.setup({ applyAccept: false });
  const view = render(<ClientMaterialStep clientId={CLIENT_ID} initialAssets={initialAssets} limits={LIMITS} />);
  const input = view.container.querySelector<HTMLInputElement>('input[type="file"]');
  if (input === null) throw new Error("no file input");
  return { user, input, ...view };
}

const createIntro = () => screen.getByText("Crea introduzione");
const rowOf = (name: string) => {
  const row = screen.getByText(name).closest("li");
  if (row === null) throw new Error(`no row for ${name}`);
  return row;
};
const reasonOf = (element: HTMLElement) => document.getElementById(element.getAttribute("aria-describedby") ?? "")?.textContent;

/** Crea introduzione is the inactive button with its linked reason. */
function expectInactive() {
  const button = createIntro();
  expect(button.tagName).toBe("BUTTON");
  expect(button.getAttribute("aria-disabled")).toBe("true");
  expect(reasonOf(button)).toBe("Carica almeno 2 immagini.");
}

describe("ClientMaterialStep", () => {
  it("shows the heading, the copy above the drop zone, a 3-file hint and an inactive Crea introduzione", () => {
    setup();
    expect(screen.getByRole("heading", { level: 2, name: "Materiale" })).toBeTruthy();
    expect(screen.getByText("Carica fino a 3 file, almeno 2 immagini. Le immagini servono per le pagine di introduzione.")).toBeTruthy();
    expect(screen.getByText("Fino a 3 file, 50 MB ciascuno.")).toBeTruthy();
    expectInactive();
  });

  it("two images: uploads through the client actions, lists them and links Crea introduzione to the client page", async () => {
    const { user, input } = setup();
    await user.upload(input, [makeFile("a.jpg", "image/jpeg", 3 * MB), makeFile("b.png", "image/png")]);
    await waitFor(() => expect(document.querySelectorAll('[data-row-state="listed"]')).toHaveLength(2));
    expect(screen.getByText("a.jpg")).toBeTruthy();
    expect(screen.getByText("b.png")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("a.jpg caricato.");
    expect(requestClientMaterialUpload).toHaveBeenCalledWith({ clientId: CLIENT_ID, contentType: "image/jpeg", sizeBytes: 3 * MB });
    expect(confirmClientMaterialUpload).toHaveBeenCalledWith({ clientId: CLIENT_ID, assetId: "asset-1", contentType: "image/jpeg", fileName: "a.jpg" });
    expect(listClientMaterial).toHaveBeenCalledWith({ clientId: CLIENT_ID });
    expect(caseAction).not.toHaveBeenCalled();
    expect(screen.getByText("2 / 3 file")).toBeTruthy();
    const link = createIntro();
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe(`/clients/${CLIENT_ID}`);
    expect(screen.queryByText("Carica almeno 2 immagini.")).toBeNull();
    // Client files have no favourites.
    expect(screen.queryByText("Preferito")).toBeNull();
  });

  it("image + PDF: both listed, Crea introduzione stays inactive with its reason", async () => {
    const { user, input } = setup();
    await user.upload(input, [makeFile("a.jpg", "image/jpeg"), makeFile("brief.pdf", "application/pdf")]);
    await waitFor(() => expect(document.querySelectorAll('[data-row-state="listed"]')).toHaveLength(2));
    expect(screen.getByText("brief.pdf")).toBeTruthy();
    expectInactive();
  });

  it("lists the stored files in position order with thumbnails for images", () => {
    setup([stored(1, { thumbnailUrl: "https://storage.test/t1" }), pdf(2), stored(3)]);
    const rows = screen.getAllByRole("listitem");
    expect(rows.map((row) => row.querySelector(".truncate")?.textContent)).toEqual(["foto-1.jpg", "brief-2.pdf", "foto-3.jpg"]);
    expect(rows[0].querySelector("img")?.getAttribute("src")).toBe("https://storage.test/t1");
    expect(screen.getByText("3 / 3 file")).toBeTruthy();
    expect(createIntro().tagName).toBe("A");
  });

  it("4th file: refused inline with Massimo 3 file. on that file only; nothing requested", async () => {
    const { user, input } = setup([stored(1), stored(2), pdf(3)]);
    await user.upload(input, [makeFile("fourth.jpg", "image/jpeg")]);
    expect(rowOf("fourth.jpg").textContent).toContain("Massimo 3 file.");
    expect(requestClientMaterialUpload).not.toHaveBeenCalled();
  });

  it("a drop of 4 on an empty client: the first 3 upload, only the 4th is refused", async () => {
    const { user, input } = setup();
    await user.upload(input, [
      makeFile("1.jpg", "image/jpeg"),
      makeFile("2.jpg", "image/jpeg"),
      makeFile("3.pdf", "application/pdf"),
      makeFile("4.jpg", "image/jpeg"),
    ]);
    expect(rowOf("4.jpg").textContent).toContain("Massimo 3 file.");
    await waitFor(() => expect(document.querySelectorAll('[data-row-state="listed"]')).toHaveLength(3));
    expect(requestClientMaterialUpload).toHaveBeenCalledTimes(3);
  });

  it("a server CLIENT_MATERIAL_LIMIT (stale count) shows Massimo 3 file. on the row", async () => {
    confirmClientMaterialUpload.mockResolvedValueOnce(fail("CLIENT_MATERIAL_LIMIT", 409));
    const { user, input } = setup();
    await user.upload(input, [makeFile("late.jpg", "image/jpeg")]);
    await waitFor(() => expect(rowOf("late.jpg").textContent).toContain("Massimo 3 file."));
  });

  it("small image: a 1200 px short side is refused inline before any upload", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 2400, height: 1200, close: () => undefined })),
    );
    const { user, input } = setup();
    await user.upload(input, [makeFile("small.jpg", "image/jpeg")]);
    await waitFor(() => expect(rowOf("small.jpg").textContent).toContain(PIXELS));
    expect(requestClientMaterialUpload).not.toHaveBeenCalled();
    expectInactive();
  });

  it("an 8001 × 1600 image is refused in the browser with the pixel message; nothing requested", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 8001, height: 1600, close: () => undefined })),
    );
    const { user, input } = setup();
    await user.upload(input, [makeFile("wide.jpg", "image/jpeg")]);
    await waitFor(() => expect(rowOf("wide.jpg").textContent).toContain(PIXELS));
    expect(requestClientMaterialUpload).not.toHaveBeenCalled();
  });

  it("an image the browser can't measure uploads, and a confirm pixel refusal shows the pixel message on its row", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        throw new Error("cannot decode");
      }),
    );
    confirmClientMaterialUpload.mockResolvedValueOnce(fail("CLIENT_IMAGE_SIZE_INVALID", 400));
    const { user, input } = setup();
    await user.upload(input, [makeFile("odd.webp", "image/webp")]);
    await waitFor(() => expect(rowOf("odd.webp").textContent).toContain(PIXELS));
    expect(requestClientMaterialUpload).toHaveBeenCalledTimes(1);
  });

  it("a presign CLIENT_MATERIAL_LIMIT shows Massimo 3 file. on that row, with no retry and no upload", async () => {
    requestClientMaterialUpload.mockResolvedValueOnce(fail("CLIENT_MATERIAL_LIMIT", 409));
    const { user, input } = setup();
    await user.upload(input, [makeFile("late.pdf", "application/pdf")]);
    await waitFor(() => expect(rowOf("late.pdf").textContent).toContain("Massimo 3 file."));
    expect(requestClientMaterialUpload).toHaveBeenCalledTimes(1);
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it("a file confirmed into a freed position is listed in position order", async () => {
    const { user, input } = setup([stored(2), stored(3)]);
    await user.upload(input, [makeFile("new.png", "image/png")]);
    await waitFor(() => expect(document.querySelectorAll('[data-row-state="listed"]')).toHaveLength(3));
    const rows = screen.getAllByRole("listitem");
    expect(rows.map((row) => row.querySelector(".truncate")?.textContent)).toEqual(["new.png", "foto-2.jpg", "foto-3.jpg"]);
  });

  it("wrong type or too big: refused inline, nothing requested", async () => {
    const { user, input } = setup();
    await user.upload(input, [makeFile("pack.zip", "application/zip"), makeFile("huge.mp4", "video/mp4", 60 * MB)]);
    expect(rowOf("pack.zip").textContent).toContain("Questo tipo di file non è supportato.");
    expect(rowOf("huge.mp4").textContent).toContain("Oltre 50 MB. Non caricato.");
    expect(requestClientMaterialUpload).not.toHaveBeenCalled();
  });

  it("type mismatch: confirm answers UPLOAD_REJECTED, no row is listed", async () => {
    confirmClientMaterialUpload.mockResolvedValueOnce(fail("UPLOAD_REJECTED", 400));
    const { user, input } = setup();
    await user.upload(input, [makeFile("fake.png", "image/png")]);
    await waitFor(() => expect(rowOf("fake.png").textContent).toContain("Il file caricato non corrisponde a quello scelto."));
    expect(document.querySelector('[data-row-state="listed"]')).toBeNull();
  });

  it("remove 1 of 2 images: the row goes at once and Crea introduzione turns inactive again", async () => {
    let finish: () => void = () => undefined;
    removeClientMaterial.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ ok: true, value: undefined });
        }),
    );
    const { user } = setup([stored(1), stored(2)]);
    expect(createIntro().tagName).toBe("A");
    await user.click(screen.getByRole("button", { name: "Rimuovi foto-2.jpg" }));
    // Gone before the server answers: no confirm, no undo.
    expect(screen.queryByText("foto-2.jpg")).toBeNull();
    expectInactive();
    expect(removeClientMaterial).toHaveBeenCalledWith({ clientId: CLIENT_ID, assetId: stored(2).id });
    await act(async () => finish());
    expect(screen.queryByText("foto-2.jpg")).toBeNull();
  });
});
