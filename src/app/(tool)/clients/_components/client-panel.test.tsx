// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResult } from "@/app/_lib/action-result";
import type {
  Client,
  ClientBriefFieldSaved,
  ClientDetail,
  ClientResultsSaved,
  ClientTestimonialSaved,
  ClientIndustry,
  ListedClientAsset,
  PresignedClientLogoUpload,
  PresignedClientMaterial,
} from "@/modules/case-study";
import { fill, it as dict } from "@/shared/i18n/it";

const replace = vi.fn();
const push = vi.fn();
const refresh = vi.fn();
const back = vi.fn();
const calls: string[] = [];
const createClient = vi.fn<(input: unknown) => Promise<ActionResult<Client>>>();
const updateClient = vi.fn<(input: unknown) => Promise<ActionResult<Client>>>();
const saveClientBriefField = vi.fn<(input: unknown) => Promise<ActionResult<ClientBriefFieldSaved>>>();
const saveClientResults = vi.fn<(input: unknown) => Promise<ActionResult<ClientResultsSaved>>>();
const saveClientTestimonial = vi.fn<(input: unknown) => Promise<ActionResult<ClientTestimonialSaved>>>();
const requestClientLogoUpload = vi.fn<(input: unknown) => Promise<ActionResult<PresignedClientLogoUpload>>>();
const confirmClientLogoUpload = vi.fn<(input: unknown) => Promise<ActionResult<{ logoId: string }>>>();
const requestClientMaterialUpload = vi.fn<(input: unknown) => Promise<ActionResult<PresignedClientMaterial>>>();
const confirmClientMaterialUpload = vi.fn<(input: unknown) => Promise<ActionResult<ListedClientAsset>>>();
const listClientMaterial = vi.fn<(input: unknown) => Promise<ActionResult<ListedClientAsset[]>>>();
const removeClientMaterial = vi.fn<(input: unknown) => Promise<ActionResult<void>>>();
const uploadFile = vi.fn<(target: unknown, file: Blob) => Promise<void>>();

/** Records the call order across actions. */
const traced =
  <A extends unknown[], R>(name: string, fn: (...args: A) => R) =>
  (...args: A) => {
    calls.push(name);
    return fn(...args);
  };

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace, refresh, back }) }));
vi.mock("@/app/(tool)/clients/actions", () => ({
  createClient: traced("createClient", (input: unknown) => createClient(input)),
  updateClient: traced("updateClient", (input: unknown) => updateClient(input)),
  saveClientBriefField: traced("saveClientBriefField", (input: unknown) => saveClientBriefField(input)),
  saveClientResults: traced("saveClientResults", (input: unknown) => saveClientResults(input)),
  saveClientTestimonial: traced("saveClientTestimonial", (input: unknown) => saveClientTestimonial(input)),
  requestClientLogoUpload: traced("requestClientLogoUpload", (input: unknown) => requestClientLogoUpload(input)),
  confirmClientLogoUpload: traced("confirmClientLogoUpload", (input: unknown) => confirmClientLogoUpload(input)),
  requestClientMaterialUpload: traced("requestClientMaterialUpload", (input: unknown) => requestClientMaterialUpload(input)),
  confirmClientMaterialUpload: traced("confirmClientMaterialUpload", (input: unknown) => confirmClientMaterialUpload(input)),
  listClientMaterial: (input: unknown) => listClientMaterial(input),
  removeClientMaterial: traced("removeClientMaterial", (input: unknown) => removeClientMaterial(input)),
  deleteClient: vi.fn(),
}));
vi.mock("@/app/(wizard)/_lib/upload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/(wizard)/_lib/upload")>()),
  uploadFile: (target: unknown, file: Blob) => uploadFile(target, file),
}));

const { ClientPanel } = await import("./client-panel");
const { markPanelOpenedInApp, clearPanelOpenedInApp } = await import("../_lib/panel-history");
const { UploadError } = await import("@/app/(wizard)/_lib/upload");
const { DEBOUNCE_MS } = await import("@/app/(wizard)/_components/use-autosave-fields");

const INDUSTRIES: ClientIndustry[] = ["interior_design", "energia", "risorse_umane", "lusso"];
const LIMITS = {
  nameMax: 120,
  descriptionMax: 400,
  briefMax: 5000,
  resultLabelMax: 80,
  resultValueMax: 20,
  testimonialQuoteMax: 600,
  testimonialAuthorMax: 120,
  logoTypes: ["image/png", "image/jpeg", "image/webp", "image/svg+xml"],
  logoMaxBytes: 5 * 1024 * 1024,
  logoMinShortSide: 400,
};
const MATERIAL = {
  maxFiles: 3,
  maxFileBytes: 50 * 1024 * 1024,
  contentTypes: ["image/jpeg", "image/png", "image/webp", "video/mp4", "application/pdf"],
  minImages: 2,
  minShortSide: 1600,
  maxSide: 8000,
};
const CLIENT_ID = "cccccccc-0000-4000-8000-000000000001";
const OLD_LOGO = "eeeeeeee-0000-4000-8000-000000000001";
const NEW_LOGO = "eeeeeeee-0000-4000-8000-000000000002";
const CREATED: Client = { id: CLIENT_ID, name: "Lumen Srl", code: "LUM", industries: ["energia", "lusso"], description: "Brand.", logoId: null };
const EXISTING: ClientDetail = {
  ...CREATED,
  logoId: OLD_LOGO,
  logoUrl: "https://x/old.png?sig",
  brief: { context: "Contesto.", solution: "Soluzione.", results: [], testimonialQuote: "", testimonialAuthor: "" },
};
const asset = (n: number, over: Partial<ListedClientAsset> = {}): ListedClientAsset => ({
  id: `ffffffff-0000-4000-8000-00000000000${n}`,
  clientId: CLIENT_ID,
  position: n,
  fileName: `foto-${n}.jpg`,
  kind: "image",
  contentType: "image/jpeg",
  sizeBytes: 4096,
  width: 2400,
  height: 1600,
  createdAt: "2026-10-21T10:00:00+00:00",
  thumbnailUrl: `https://x/thumb-${n}.jpg`,
  ...over,
});

const png = (name = "logo.png") => new File([new Uint8Array(2048)], name, { type: "image/png" });
const jpg = (name: string) => new File([new Uint8Array(4096)], name, { type: "image/jpeg" });
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement | HTMLTextAreaElement;
const pill = (name: string) => screen.getByRole("button", { name });
const primary = (name: "Aggiungi" | "Salva") => screen.getByRole("button", { name });
const fileInputs = () => document.querySelectorAll<HTMLInputElement>("input[type=file]");
const logoInput = () => fileInputs()[0];
const imageInput = () => fileInputs()[1];
const counter = () => screen.getByText(/ di 3$/);
const setup = () => userEvent.setup({ applyAccept: false });
const describedText = (el: Element) =>
  (el.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" | ");

const renderPanel = (client: ClientDetail | null = null, assets: ListedClientAsset[] = [], caseCount: number | null = null) =>
  render(<ClientPanel client={client} assets={assets} caseCount={caseCount} industries={INDUSTRIES} limits={LIMITS} materialLimits={MATERIAL} />);

/** Fills every field of a new client, picks a logo and two images. */
async function fillAll(user: ReturnType<typeof setup>) {
  fireEvent.change(field("Nome"), { target: { value: " Lumen Srl " } });
  await user.click(pill("Lusso"));
  await user.click(pill("Energia"));
  fireEvent.change(field("Descrizione"), { target: { value: " Brand. " } });
  await user.upload(logoInput(), png());
  await waitFor(() => expect(screen.getByRole("img", { name: "Logo Lumen Srl" })).toBeTruthy());
  await user.upload(imageInput(), jpg("uno.jpg"));
  await waitFor(() => expect(counter().textContent).toBe("1 di 3"));
  await user.upload(imageInput(), jpg("due.jpg"));
  await waitFor(() => expect(counter().textContent).toBe("2 di 3"));
  fireEvent.change(field("Contesto"), { target: { value: "C" } });
  fireEvent.change(field("Soluzione"), { target: { value: "S" } });
}

let assetSeq = 0;
beforeEach(() => {
  calls.length = 0;
  assetSeq = 0;
  for (const fn of [
    push,
    replace,
    refresh,
    back,
    createClient,
    updateClient,
    saveClientBriefField,
    saveClientResults,
    saveClientTestimonial,
    requestClientLogoUpload,
    confirmClientLogoUpload,
    requestClientMaterialUpload,
    confirmClientMaterialUpload,
    listClientMaterial,
    removeClientMaterial,
    uploadFile,
  ]) {
    fn.mockReset();
  }
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width: 2400, height: 1600, close: () => undefined })),
  );
  window.confirm = vi.fn(() => true);
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(window.history, "replaceState");
  createClient.mockResolvedValue({ ok: true, value: CREATED });
  updateClient.mockImplementation(async (input) => ({ ok: true, value: { ...CREATED, logoId: (input as { logoId: string }).logoId } }));
  saveClientBriefField.mockImplementation(async (input) => {
    const { field: key, text } = input as ClientBriefFieldSaved;
    return { ok: true, value: { field: key, text } };
  });
  saveClientResults.mockImplementation(async (input) => ({ ok: true, value: { results: (input as ClientResultsSaved).results } }));
  saveClientTestimonial.mockImplementation(async (input) => {
    const { quote, author } = input as ClientTestimonialSaved;
    return { ok: true, value: { quote, author } };
  });
  requestClientLogoUpload.mockResolvedValue({ ok: true, value: { logoId: NEW_LOGO, url: "https://x/logo", method: "PUT", headers: {} } });
  confirmClientLogoUpload.mockResolvedValue({ ok: true, value: { logoId: NEW_LOGO } });
  requestClientMaterialUpload.mockImplementation(async () => ({
    ok: true,
    value: { assetId: `ffffffff-0000-4000-8000-00000000010${++assetSeq}`, url: "https://x/material", method: "PUT", headers: {} },
  }));
  confirmClientMaterialUpload.mockImplementation(async (input) => {
    const { assetId, fileName } = input as { assetId: string; fileName: string };
    return { ok: true, value: asset(1, { id: assetId, fileName }) };
  });
  listClientMaterial.mockResolvedValue({ ok: true, value: [] });
  removeClientMaterial.mockResolvedValue({ ok: true, value: undefined });
  uploadFile.mockResolvedValue(undefined);
});
afterEach(() => {
  clearPanelOpenedInApp();
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ClientPanel, a new client", () => {
  it("opens as Nuovo cliente with the code line, three numbered sections and Aggiungi inactive with the missing list", () => {
    renderPanel();
    const sheet = screen.getByRole("dialog", { name: dict.clientPanel.addTitle });
    expect(describedText(sheet)).toBe(dict.clientPanel.addNote);
    expect(within(sheet).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Dettagli", "Logo e immagini", "Racconto"]);
    expect(field("Nome").getAttribute("placeholder")).toBe(dict.clientPanel.details.namePlaceholder);
    expect(document.activeElement).toBe(field("Nome"));
    expect(describedText(field("Descrizione"))).toContain(dict.clientPanel.details.descriptionHint);
    expect(counter().textContent).toBe("0 di 3");
    expect(screen.getByText(fill(dict.clientPanel.images.hint, { min: 2, max: 3, px: 1600, types: "PNG, JPEG o WebP" }))).toBeTruthy();
    expect(screen.getByRole("button", { name: dict.clientPanel.images.addLabel })).toBeTruthy();
    expect(primary("Aggiungi").getAttribute("aria-disabled")).toBe("true");
    expect(describedText(primary("Aggiungi"))).toBe(
      "Per andare avanti manca: Nome, Settore, Descrizione, Logo, Immagini, Contesto, Soluzione.",
    );
    expect(screen.queryByRole("button", { name: "Elimina cliente" })).toBeNull();
  });

  it("keeps picked files in the browser, then on Aggiungi creates, uploads the logo, links it, saves the texts, results and testimonial, uploads the images and opens the client page", async () => {
    const user = setup();
    renderPanel();
    await fillAll(user);
    fireEvent.change(field("Risultato 1, cosa misuri"), { target: { value: "Visite" } });
    fireEvent.change(field("Risultato 1, numero"), { target: { value: "2,4M" } });
    fireEvent.change(field("Frase del cliente"), { target: { value: "Ci hanno capiti." } });
    expect(calls).toEqual([]);
    expect(primary("Aggiungi").hasAttribute("aria-disabled")).toBe(false);

    await user.click(primary("Aggiungi"));
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/clients/${CLIENT_ID}`, undefined));
    expect(calls).toEqual([
      "createClient",
      "requestClientLogoUpload",
      "confirmClientLogoUpload",
      "updateClient",
      "saveClientBriefField",
      "saveClientBriefField",
      "saveClientResults",
      "saveClientTestimonial",
      "requestClientMaterialUpload",
      "confirmClientMaterialUpload",
      "requestClientMaterialUpload",
      "confirmClientMaterialUpload",
    ]);
    expect(createClient).toHaveBeenCalledWith({ name: "Lumen Srl", industries: ["energia", "lusso"], description: "Brand." });
    expect(updateClient).toHaveBeenCalledWith({ clientId: CLIENT_ID, name: "Lumen Srl", industries: ["energia", "lusso"], description: "Brand.", logoId: NEW_LOGO });
    expect(requestClientMaterialUpload).toHaveBeenNthCalledWith(1, { clientId: CLIENT_ID, contentType: "image/jpeg", sizeBytes: 4096 });
    expect(confirmClientMaterialUpload.mock.calls.map(([input]) => (input as { fileName: string }).fileName)).toEqual(["uno.jpg", "due.jpg"]);
    expect(window.history.replaceState).toHaveBeenCalledWith(null, "", `/clients/${CLIENT_ID}?modifica=1`);
    expect(saveClientResults).toHaveBeenCalledWith({ clientId: CLIENT_ID, results: [{ label: "Visite", value: "2,4M" }] });
    expect(saveClientTestimonial).toHaveBeenCalledWith({ clientId: CLIENT_ID, quote: "Ci hanno capiti.", author: "" });
  });

  it("adds a client with no results and no testimonial without saving them", async () => {
    const user = setup();
    renderPanel();
    await fillAll(user);
    await user.click(primary("Aggiungi"));
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/clients/${CLIENT_ID}`, undefined));
    expect(saveClientResults).not.toHaveBeenCalled();
    expect(saveClientTestimonial).not.toHaveBeenCalled();
  });

  it("stays open as Modifica cliente when an image upload fails after the create, shows the error on its slot, and Salva retries it", async () => {
    const user = setup();
    renderPanel();
    await fillAll(user);
    uploadFile.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("network"));

    await user.click(primary("Aggiungi"));
    await screen.findByText(dict.clientPanel.images.errors.failed);
    expect(screen.getByRole("dialog", { name: dict.clientPanel.editTitle })).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
    expect(window.history.replaceState).toHaveBeenCalledWith(null, "", `/clients/${CLIENT_ID}?modifica=1`);
    expect(counter().textContent).toBe("2 di 3");
    const failedSlot = screen.getByRole("button", { name: "Rimuovi due.jpg" });
    expect(describedText(failedSlot)).toBe(dict.clientPanel.images.errors.failed);

    calls.length = 0;
    await user.click(primary("Salva"));
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/clients/${CLIENT_ID}`, { scroll: false }));
    // Created, logo linked and texts saved already: only the failed image again.
    expect(calls).toEqual(["requestClientMaterialUpload", "confirmClientMaterialUpload"]);
    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it("refuses a too-small image on pick: the reason shows and the counter does not change", async () => {
    const user = setup();
    vi.mocked(createImageBitmap).mockResolvedValue({ width: 1200, height: 800, close: () => undefined } as unknown as ImageBitmap);
    renderPanel();
    await user.upload(imageInput(), jpg("piccola.jpg"));
    const pixels = fill(dict.clientPanel.images.errors.pixels, { min: 1600, max: 8000 });
    expect(await screen.findByText(pixels)).toBeTruthy();
    expect(counter().textContent).toBe("0 di 3");
    expect(describedText(screen.getByRole("button", { name: dict.clientPanel.images.addLabel }))).toContain(pixels);
  });

  it("refuses a file that is not an image", async () => {
    const user = setup();
    renderPanel();
    await user.upload(imageInput(), new File([new Uint8Array(10)], "brief.pdf", { type: "application/pdf" }));
    expect(await screen.findByText(fill(dict.clientPanel.images.errors.type, { types: "PNG, JPEG o WebP" }))).toBeTruthy();
    expect(counter().textContent).toBe("0 di 3");
  });

  it("offers no slot once three are full, and a waiting image is removed without a request", async () => {
    const user = setup();
    renderPanel();
    for (const name of ["a.jpg", "b.jpg", "c.jpg"]) await user.upload(imageInput(), jpg(name));
    await waitFor(() => expect(counter().textContent).toBe("3 di 3"));
    expect(screen.queryByRole("button", { name: dict.clientPanel.images.addLabel })).toBeNull();
    await user.upload(imageInput(), jpg("d.jpg"));
    expect(counter().textContent).toBe("3 di 3");
    await user.click(screen.getByRole("button", { name: "Rimuovi b.jpg" }));
    expect(counter().textContent).toBe("2 di 3");
    expect(removeClientMaterial).not.toHaveBeenCalled();
  });

  it("asks before closing with entries; cancelling the confirm keeps the panel", async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    const user = setup();
    renderPanel();
    fireEvent.change(field("Nome"), { target: { value: "Lumen" } });
    await user.click(screen.getByRole("button", { name: "Annulla" }));
    expect(window.confirm).toHaveBeenCalledWith(dict.wizard.unsavedConfirm);
    expect(replace).not.toHaveBeenCalled();
    act(() => {
      document.querySelector("dialog")!.dispatchEvent(new Event("cancel", { cancelable: true }));
    });
    expect(window.confirm).toHaveBeenCalledTimes(2);
    expect(replace).not.toHaveBeenCalled();
    expect((document.querySelector("dialog") as HTMLDialogElement).open).toBe(true);

    vi.mocked(window.confirm).mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "Chiudi" }));
    expect(replace).toHaveBeenCalledWith("/clients", { scroll: false });
  });

  it("closes at once when nothing was entered", async () => {
    const user = setup();
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Annulla" }));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/clients", { scroll: false });
  });

  it("does not open below 1024 px", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    renderPanel();
    expect(document.querySelector("dialog")).toBeNull();
  });
});

describe("ClientPanel, an existing client", () => {
  const existing = () => renderPanel(EXISTING, [asset(1), asset(2, { kind: "document", contentType: "application/pdf", fileName: "brief.pdf", thumbnailUrl: null })], 2);

  it("opens as Modifica cliente, prefilled with the data, logo, files and brief, with Elimina cliente at the bottom", () => {
    existing();
    const sheet = screen.getByRole("dialog", { name: dict.clientPanel.editTitle });
    expect(describedText(sheet)).toBe(fill(dict.clientPanel.editNote, { code: "LUM" }));
    expect(field("Nome").value).toBe("Lumen Srl");
    expect(pill("Energia").getAttribute("aria-pressed")).toBe("true");
    expect(field("Descrizione").value).toBe("Brand.");
    expect(field("Contesto").value).toBe("Contesto.");
    expect(screen.getByRole("img", { name: "Logo Lumen Srl" }).getAttribute("src")).toBe(EXISTING.logoUrl);
    expect(describedText(screen.getByRole("button", { name: "Cambia logo" }))).toContain(dict.clientPanel.details.logoReplaceHint);
    expect(screen.getByRole("img", { name: "Immagine 1" }).getAttribute("src")).toBe("https://x/thumb-1.jpg");
    expect(screen.getByText("brief.pdf")).toBeTruthy();
    // One image and a PDF: one more image is needed.
    expect(counter().textContent).toBe("1 di 3");
    expect(describedText(primary("Salva"))).toBe("Per andare avanti manca: Immagini.");
    const remove = screen.getByRole("button", { name: "Elimina cliente" });
    const body = sheet.querySelector("[data-sheet-body]")!;
    expect(body.lastElementChild?.contains(remove)).toBe(true);
  });

  it("uploads a picked image and a picked logo at once, removes a file at once, and links the logo on Salva", async () => {
    const user = setup();
    existing();
    await user.upload(imageInput(), jpg("nuova.jpg"));
    await waitFor(() => expect(confirmClientMaterialUpload).toHaveBeenCalledWith(expect.objectContaining({ clientId: CLIENT_ID, fileName: "nuova.jpg" })));
    await waitFor(() => expect(counter().textContent).toBe("2 di 3"));

    await user.upload(logoInput(), png("nuovo-logo.png"));
    await waitFor(() => expect(confirmClientLogoUpload).toHaveBeenCalledTimes(1));
    expect(updateClient).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Rimuovi brief.pdf" }));
    await waitFor(() => expect(removeClientMaterial).toHaveBeenCalledWith({ clientId: CLIENT_ID, assetId: asset(2).id }));
    await waitFor(() => expect(screen.queryByText("brief.pdf")).toBeNull());

    await user.click(primary("Salva"));
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/clients/${CLIENT_ID}`, { scroll: false }));
    expect(requestClientLogoUpload).toHaveBeenCalledTimes(1);
    expect(updateClient).toHaveBeenCalledWith({ clientId: CLIENT_ID, name: "Lumen Srl", industries: ["energia", "lusso"], description: "Brand.", logoId: NEW_LOGO });
  });

  it("closes without asking when everything is saved, back to the client page", async () => {
    const user = setup();
    existing();
    await user.click(screen.getByRole("button", { name: "Annulla" }));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith(`/clients/${CLIENT_ID}`, { scroll: false });
  });

  it("asks before closing with a changed name", async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    const user = setup();
    existing();
    fireEvent.change(field("Nome"), { target: { value: "Lumen Group" } });
    await user.click(screen.getByRole("button", { name: "Annulla" }));
    expect(window.confirm).toHaveBeenCalledWith(dict.wizard.unsavedConfirm);
    expect(replace).not.toHaveBeenCalled();
  });
});

/** A promise the test settles. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const statusText = () => document.querySelector("[role=status]")?.textContent ?? "";
const TWO_IMAGES = [asset(1), asset(2)];

describe("ClientPanel, the logo", () => {
  it("refuses an unsafe SVG with its message and never uploads it", async () => {
    const user = setup();
    renderPanel(EXISTING, TWO_IMAGES);
    const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], "logo.svg", { type: "image/svg+xml" });
    await user.upload(logoInput(), svg);
    expect(await screen.findByText(dict.clients.errors.logoUnsafe)).toBeTruthy();
    expect(requestClientLogoUpload).not.toHaveBeenCalled();
  });

  it("refuses a raster logo under 400 px before any request", async () => {
    const user = setup();
    vi.mocked(createImageBitmap).mockResolvedValue({ width: 300, height: 900, close: () => undefined } as unknown as ImageBitmap);
    renderPanel(EXISTING, TWO_IMAGES);
    await user.upload(logoInput(), png());
    expect(await screen.findByText(fill(dict.clients.errors.logoTooSmall, { px: 400 }))).toBeTruthy();
    expect(requestClientLogoUpload).not.toHaveBeenCalled();
  });

  it("ignores a slower, older pick's measurement", async () => {
    const user = setup();
    const slow = deferred<ImageBitmap>();
    vi.mocked(createImageBitmap)
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce({ width: 800, height: 800, close: () => undefined } as unknown as ImageBitmap);
    renderPanel();
    await user.upload(logoInput(), png("vecchio.png"));
    await user.upload(logoInput(), png("nuovo.png"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Cambia logo" })).toBeTruthy());
    await act(async () => slow.resolve({ width: 100, height: 100, close: () => undefined } as unknown as ImageBitmap));
    expect(screen.queryByText(fill(dict.clients.errors.logoTooSmall, { px: 400 }))).toBeNull();
  });

  it("shows the replace line and a whole number of MB for a new client too", () => {
    render(
      <ClientPanel client={null} assets={[]} caseCount={null} industries={INDUSTRIES} limits={{ ...LIMITS, logoMaxBytes: 5.4 * 1024 * 1024 }} materialLimits={MATERIAL} />,
    );
    expect(screen.getByText(dict.clientPanel.details.logoReplaceHint)).toBeTruthy();
    expect(screen.getByText(/fino a 5 MB\./)).toBeTruthy();
  });

  it("links the logo again on Salva after a failed link, without a second upload", async () => {
    const user = setup();
    renderPanel();
    await fillAll(user);
    updateClient.mockResolvedValueOnce({ ok: false, status: 500, error: { code: "INTERNAL", message: "down" } });
    await user.click(primary("Aggiungi"));
    expect(await screen.findByText(dict.clients.errors.logoFailed)).toBeTruthy();
    expect(refresh).toHaveBeenCalled();
    await user.click(primary("Salva"));
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/clients/${CLIENT_ID}`, { scroll: false }));
    expect(requestClientLogoUpload).toHaveBeenCalledTimes(1);
    expect(updateClient).toHaveBeenCalledTimes(2);
    expect(updateClient).toHaveBeenLastCalledWith(expect.objectContaining({ logoId: NEW_LOGO }));
  });
});

describe("ClientPanel, saving", () => {
  it("shows CLIENT_NAME_TAKEN on Nome and calls nothing else", async () => {
    const user = setup();
    renderPanel();
    await fillAll(user);
    createClient.mockResolvedValue({ ok: false, status: 409, error: { code: "CLIENT_NAME_TAKEN", message: "taken" } });
    await user.click(primary("Aggiungi"));
    expect(await screen.findByText(dict.clients.errors.nameTaken)).toBeTruthy();
    expect(field("Nome").getAttribute("aria-invalid")).toBe("true");
    expect(calls).toEqual(["createClient"]);
    expect(replace).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("creates once on a double Aggiungi", async () => {
    const user = setup();
    const created = deferred<ActionResult<Client>>();
    createClient.mockReturnValue(created.promise);
    renderPanel();
    await fillAll(user);
    await user.click(primary("Aggiungi"));
    await user.click(primary("Aggiungi"));
    await act(async () => created.resolve({ ok: true, value: CREATED }));
    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it("on an existing client, saves a rename with the current logo, and calls nothing when unchanged", async () => {
    const user = setup();
    renderPanel(EXISTING, TWO_IMAGES);
    await user.click(primary("Salva"));
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    expect(updateClient).not.toHaveBeenCalled();
    cleanup();
    replace.mockReset();

    renderPanel(EXISTING, TWO_IMAGES);
    fireEvent.change(field("Nome"), { target: { value: "Lumen Group" } });
    await user.click(primary("Salva"));
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    expect(updateClient).toHaveBeenCalledWith({ clientId: CLIENT_ID, name: "Lumen Group", industries: ["energia", "lusso"], description: "Brand.", logoId: OLD_LOGO });
  });

  it("saves an existing client's brief on blur; a new client's brief saves nothing", async () => {
    renderPanel(EXISTING, TWO_IMAGES);
    fireEvent.change(field("Contesto"), { target: { value: "Nuovo contesto." } });
    fireEvent.blur(field("Contesto"));
    await waitFor(() => expect(saveClientBriefField).toHaveBeenCalledWith({ clientId: CLIENT_ID, field: "context", text: "Nuovo contesto." }));
    cleanup();
    saveClientBriefField.mockClear();

    renderPanel();
    fireEvent.change(field("Contesto"), { target: { value: "Bozza." } });
    fireEvent.blur(field("Contesto"));
    await new Promise((done) => setTimeout(done, 20));
    expect(saveClientBriefField).not.toHaveBeenCalled();
  });
});

describe("ClientPanel, Risultati and Testimonial", () => {
  const label = (n: number) => field(`Risultato ${n}, cosa misuri`);
  const value = (n: number) => field(`Risultato ${n}, numero`);
  const quote = () => field("Frase del cliente");
  const author = () => field("Autore della frase");
  const copy = dict.clientPanel.details;

  it("shows 3 rows with the mock's placeholders, the hints, and no required mark", () => {
    renderPanel(EXISTING, TWO_IMAGES);
    expect([1, 2, 3].map((n) => [label(n).placeholder, value(n).placeholder])).toEqual([
      ["Candidature ricevute", "+180%"],
      ["Visualizzazioni video", "2,4M"],
      ["Follower su LinkedIn", "+35%"],
    ]);
    const results = screen.getByRole("group", { name: "Risultati" });
    expect(describedText(results)).toBe(copy.results.hint);
    const testimonial = screen.getByRole("group", { name: "Testimonial" });
    expect(describedText(testimonial)).toBe(copy.testimonial.hint);
    expect(quote().placeholder).toBe("Una frase del cliente, tra virgolette nel suo stile");
    expect(author().placeholder).toBe("Nome Cognome, ruolo");
    expect(label(1).hasAttribute("aria-required")).toBe(false);
  });

  it("saves a filled row when its value loses focus, and shows saved results top first", async () => {
    renderPanel(EXISTING, TWO_IMAGES);
    fireEvent.change(label(1), { target: { value: " Candidature ricevute " } });
    fireEvent.change(value(1), { target: { value: "+180%" } });
    fireEvent.blur(value(1));
    await waitFor(() =>
      expect(saveClientResults).toHaveBeenCalledWith({ clientId: CLIENT_ID, results: [{ label: "Candidature ricevute", value: "+180%" }] }),
    );
    cleanup();

    const results = [
      { label: "Visite", value: "2,4M" },
      { label: "Follower", value: "+35%" },
    ];
    renderPanel({ ...EXISTING, brief: { ...EXISTING.brief, results } }, TWO_IMAGES);
    expect([1, 2, 3].map((n) => [label(n).value, value(n).value])).toEqual([
      ["Visite", "2,4M"],
      ["Follower", "+35%"],
      ["", ""],
    ]);
  });

  it("saves rows 1 and 3 as two results in that order", async () => {
    renderPanel(EXISTING, TWO_IMAGES);
    fireEvent.change(label(1), { target: { value: "Visite" } });
    fireEvent.change(value(1), { target: { value: "2,4M" } });
    fireEvent.change(label(3), { target: { value: "Follower" } });
    fireEvent.change(value(3), { target: { value: "+35%" } });
    fireEvent.blur(value(3));
    await waitFor(() =>
      expect(saveClientResults).toHaveBeenLastCalledWith({
        clientId: CLIENT_ID,
        results: [
          { label: "Visite", value: "2,4M" },
          { label: "Follower", value: "+35%" },
        ],
      }),
    );
  });

  it("does not save a half row: it shows the message once focus leaves it, and the other rows save", async () => {
    renderPanel(EXISTING, TWO_IMAGES);
    fireEvent.change(label(1), { target: { value: "Visite" } });
    fireEvent.change(value(1), { target: { value: "2,4M" } });
    fireEvent.change(label(2), { target: { value: "Follower" } });
    expect(screen.queryByText(copy.results.halfRow)).toBeNull();
    fireEvent.blur(label(2));
    await waitFor(() => expect(saveClientResults).toHaveBeenCalledWith({ clientId: CLIENT_ID, results: [{ label: "Visite", value: "2,4M" }] }));
    expect(saveClientResults).toHaveBeenCalledTimes(1);
    expect(screen.getByText(copy.results.halfRow)).toBeTruthy();
    expect(value(2).getAttribute("aria-invalid")).toBe("true");
    expect(describedText(value(2))).toBe(copy.results.halfRow);
    expect(screen.queryByText(dict.clients.errors.generic)).toBeNull();
  });

  it("shows the limit on a value over 20 characters and does not save it", async () => {
    renderPanel(EXISTING, TWO_IMAGES);
    fireEvent.change(label(1), { target: { value: "Visite" } });
    fireEvent.change(value(1), { target: { value: "x".repeat(21) } });
    fireEvent.blur(value(1));
    expect(screen.getByText(fill(dict.clients.errors.fieldTooLong, { max: 20 }))).toBeTruthy();
    expect(value(1).getAttribute("aria-invalid")).toBe("true");
    await new Promise((done) => setTimeout(done, 20));
    expect(saveClientResults).not.toHaveBeenCalled();
  });

  it("saves a quote without an author", async () => {
    renderPanel(EXISTING, TWO_IMAGES);
    fireEvent.change(quote(), { target: { value: "Ci hanno capiti." } });
    fireEvent.blur(quote());
    await waitFor(() => expect(saveClientTestimonial).toHaveBeenCalledWith({ clientId: CLIENT_ID, quote: "Ci hanno capiti.", author: "" }));
  });

  it("does not save an author without a quote: it says Manca la frase.", async () => {
    renderPanel(EXISTING, TWO_IMAGES);
    fireEvent.change(author(), { target: { value: "Ada Rossi, CEO" } });
    fireEvent.blur(author());
    expect(await screen.findByText("Manca la frase.")).toBeTruthy();
    expect(quote().getAttribute("aria-invalid")).toBe("true");
    await new Promise((done) => setTimeout(done, 20));
    expect(saveClientTestimonial).not.toHaveBeenCalled();
  });

  it("counts a half row as unsaved when closing, and Salva stops at it", async () => {
    const user = setup();
    window.confirm = vi.fn(() => false);
    renderPanel(EXISTING, TWO_IMAGES);
    fireEvent.change(label(1), { target: { value: "Visite" } });
    await user.click(screen.getByRole("button", { name: "Annulla" }));
    expect(window.confirm).toHaveBeenCalledWith(dict.wizard.unsavedConfirm);
    expect(replace).not.toHaveBeenCalled();

    await user.click(primary("Salva"));
    expect(document.activeElement).toBe(value(1));
    expect(screen.getByText(copy.results.halfRow)).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it("announces a failed results save and shows it under Risultati", async () => {
    saveClientResults.mockResolvedValue({ ok: false, status: 500, error: { code: "CLIENT_WRITE_FAILED", message: "down" } });
    renderPanel(EXISTING, TWO_IMAGES);
    fireEvent.change(label(1), { target: { value: "Visite" } });
    fireEvent.change(value(1), { target: { value: "2,4M" } });
    fireEvent.blur(value(1));
    expect(await screen.findByText(copy.errors.saveFailed)).toBeTruthy();
    expect(statusText()).toContain(`Risultati: ${copy.errors.saveFailed}`);
  });

  it("shows a failed testimonial save under Testimonial", async () => {
    saveClientTestimonial.mockResolvedValue({ ok: false, status: 500, error: { code: "CLIENT_WRITE_FAILED", message: "down" } });
    renderPanel(EXISTING, TWO_IMAGES);
    fireEvent.change(quote(), { target: { value: "Ci hanno capiti." } });
    fireEvent.blur(quote());
    await waitFor(() => expect(describedText(screen.getByRole("group", { name: "Testimonial" }))).toContain(copy.errors.saveFailed));
    expect(describedText(screen.getByRole("group", { name: "Risultati" }))).not.toContain(copy.errors.saveFailed);
  });

  it("hides the half-row message once the row is complete", async () => {
    renderPanel(EXISTING, TWO_IMAGES);
    fireEvent.change(label(2), { target: { value: "Follower" } });
    fireEvent.blur(label(2));
    expect(await screen.findByText(copy.results.halfRow)).toBeTruthy();
    fireEvent.change(value(2), { target: { value: "+35%" } });
    expect(screen.queryByText(copy.results.halfRow)).toBeNull();
    fireEvent.change(value(2), { target: { value: "" } });
    expect(screen.queryByText(copy.results.halfRow)).toBeNull();
  });

  it("shows the limit on a label over 80 and an author over 120 characters", () => {
    renderPanel(EXISTING, TWO_IMAGES);
    fireEvent.change(label(1), { target: { value: "x".repeat(81) } });
    fireEvent.change(author(), { target: { value: "x".repeat(121) } });
    expect(describedText(label(1))).toBe(fill(dict.clients.errors.fieldTooLong, { max: 80 }));
    expect(label(1).getAttribute("aria-invalid")).toBe("true");
    expect(describedText(author())).toBe(fill(dict.clients.errors.fieldTooLong, { max: 120 }));
    expect(author().getAttribute("aria-invalid")).toBe("true");
  });

  it("does not let an over-long row or author block the valid rows and quote", async () => {
    renderPanel(EXISTING, TWO_IMAGES);
    fireEvent.change(label(1), { target: { value: "x".repeat(81) } });
    fireEvent.change(value(1), { target: { value: "1" } });
    fireEvent.change(label(2), { target: { value: "Follower" } });
    fireEvent.change(value(2), { target: { value: "+35%" } });
    fireEvent.blur(value(2));
    await waitFor(() => expect(saveClientResults).toHaveBeenCalledWith({ clientId: CLIENT_ID, results: [{ label: "Follower", value: "+35%" }] }));

    fireEvent.change(quote(), { target: { value: "Frase." } });
    fireEvent.change(author(), { target: { value: "x".repeat(121) } });
    fireEvent.blur(author());
    await waitFor(() => expect(saveClientTestimonial).toHaveBeenCalledWith({ clientId: CLIENT_ID, quote: "Frase.", author: "" }));
  });

  it("keeps a saved row stored while one of its parts is cleared; the other rows still save", async () => {
    const results = [
      { label: "Visite", value: "2,4M" },
      { label: "Follower", value: "+35%" },
    ];
    renderPanel({ ...EXISTING, brief: { ...EXISTING.brief, results } }, TWO_IMAGES);
    fireEvent.change(value(1), { target: { value: "" } });
    fireEvent.blur(value(1));
    await new Promise((done) => setTimeout(done, 20));
    expect(saveClientResults).not.toHaveBeenCalled();
    fireEvent.change(value(2), { target: { value: "+40%" } });
    fireEvent.blur(value(2));
    await waitFor(() =>
      expect(saveClientResults).toHaveBeenCalledWith({
        clientId: CLIENT_ID,
        results: [
          { label: "Visite", value: "2,4M" },
          { label: "Follower", value: "+40%" },
        ],
      }),
    );
    // Emptied, the row goes.
    fireEvent.change(label(1), { target: { value: "" } });
    fireEvent.blur(label(1));
    await waitFor(() => expect(saveClientResults).toHaveBeenLastCalledWith({ clientId: CLIENT_ID, results: [{ label: "Follower", value: "+40%" }] }));
  });

  it("keeps the stored testimonial while its quote is cleared", async () => {
    renderPanel({ ...EXISTING, brief: { ...EXISTING.brief, testimonialQuote: "Ci hanno capiti.", testimonialAuthor: "Ada Rossi, CEO" } }, TWO_IMAGES);
    fireEvent.change(quote(), { target: { value: "" } });
    fireEvent.blur(quote());
    fireEvent.blur(author());
    expect(await screen.findByText("Manca la frase.")).toBeTruthy();
    await new Promise((done) => setTimeout(done, 20));
    expect(saveClientTestimonial).not.toHaveBeenCalled();
    fireEvent.change(author(), { target: { value: "" } });
    fireEvent.blur(author());
    await waitFor(() => expect(saveClientTestimonial).toHaveBeenCalledWith({ clientId: CLIENT_ID, quote: "", author: "" }));
  });

  describe("on Aggiungi", () => {
    it("stops before createClient at a value over 20 characters and focuses it", async () => {
      const user = setup();
      renderPanel();
      await fillAll(user);
      fireEvent.change(label(1), { target: { value: "Visite" } });
      fireEvent.change(value(1), { target: { value: "x".repeat(21) } });
      await user.click(primary("Aggiungi"));
      expect(document.activeElement).toBe(value(1));
      expect(createClient).not.toHaveBeenCalled();
    });

    it("stops at a half row, focusing its empty part with the message", async () => {
      const user = setup();
      renderPanel();
      await fillAll(user);
      fireEvent.change(label(2), { target: { value: "Follower" } });
      await user.click(primary("Aggiungi"));
      expect(document.activeElement).toBe(value(2));
      expect(screen.getByText(copy.results.halfRow)).toBeTruthy();
      expect(createClient).not.toHaveBeenCalled();
    });

    it("stops at an author without a quote, focusing the quote with Manca la frase.", async () => {
      const user = setup();
      renderPanel();
      await fillAll(user);
      fireEvent.change(author(), { target: { value: "Ada Rossi" } });
      await user.click(primary("Aggiungi"));
      expect(document.activeElement).toBe(quote());
      expect(screen.getByText("Manca la frase.")).toBeTruthy();
      expect(createClient).not.toHaveBeenCalled();
    });
  });
});

describe("ClientPanel, the image slots", () => {
  it("drops a slot the server refuses for its pixels, with the pixel message, and announces it", async () => {
    const user = setup();
    confirmClientMaterialUpload.mockResolvedValue({ ok: false, status: 400, error: { code: "CLIENT_IMAGE_SIZE_INVALID", message: "px" } });
    renderPanel(EXISTING, [asset(1)]);
    await user.upload(imageInput(), jpg("grande.jpg"));
    const pixels = fill(dict.clientPanel.images.errors.pixels, { min: 1600, max: 8000 });
    expect(await screen.findByText(pixels)).toBeTruthy();
    expect(counter().textContent).toBe("1 di 3");
    expect(screen.queryByRole("button", { name: "Rimuovi grande.jpg" })).toBeNull();
    expect(statusText()).toContain(`grande.jpg: ${pixels}`);
  });

  it("says the limit with the number of files from the limits", async () => {
    const user = setup();
    requestClientMaterialUpload.mockResolvedValue({ ok: false, status: 409, error: { code: "CLIENT_MATERIAL_LIMIT", message: "limit" } });
    renderPanel(EXISTING, [asset(1)]);
    await user.upload(imageInput(), jpg("quarta.jpg"));
    expect(await screen.findByText(fill(dict.clientPanel.images.errors.limit, { max: 3 }))).toBeTruthy();
  });

  it("treats an unknown refusal under 500 and a storage 4xx as final: the slot goes", async () => {
    const user = setup();
    requestClientMaterialUpload.mockResolvedValueOnce({ ok: false, status: 403, error: { code: "FORBIDDEN", message: "no" } });
    renderPanel(EXISTING, [asset(1)]);
    await user.upload(imageInput(), jpg("a.jpg"));
    expect(await screen.findByText(dict.clientPanel.images.errors.refused)).toBeTruthy();
    expect(counter().textContent).toBe("1 di 3");

    uploadFile.mockRejectedValueOnce(new UploadError("Storage answered 403.", 403));
    await user.upload(imageInput(), jpg("b.jpg"));
    await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(dict.clientPanel.images.errors.refused)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Rimuovi b.jpg" })).toBeNull();
    expect(counter().textContent).toBe("1 di 3");
  });

  it("keeps a slot after a network failure, for a retry", async () => {
    const user = setup();
    uploadFile.mockRejectedValueOnce(new UploadError("Network error.", 0));
    renderPanel(EXISTING, [asset(1)]);
    await user.upload(imageInput(), jpg("rete.jpg"));
    expect(await screen.findByText(dict.clientPanel.images.errors.failed)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Rimuovi rete.jpg" })).toBeTruthy();
  });

  it("finds a file stored despite a 5xx confirm in the list, without a second upload", async () => {
    const user = setup();
    confirmClientMaterialUpload.mockResolvedValue({ ok: false, status: 500, error: { code: "INTERNAL", message: "down" } });
    listClientMaterial.mockImplementation(async () => ({ ok: true, value: [asset(1), asset(2, { id: "ffffffff-0000-4000-8000-000000000101", fileName: "salvata.jpg" })] }));
    renderPanel(EXISTING, [asset(1)]);
    await user.upload(imageInput(), jpg("salvata.jpg"));
    await waitFor(() => expect(counter().textContent).toBe("2 di 3"));
    await waitFor(() => expect(statusText()).toContain(fill(dict.clientPanel.images.announce.done, { name: "salvata.jpg" })));
    expect(requestClientMaterialUpload).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(dict.clientPanel.images.errors.failed)).toBeNull();
  });

  it("keeps a slot whose removal failed, with the remove error", async () => {
    const user = setup();
    removeClientMaterial.mockResolvedValue({ ok: false, status: 500, error: { code: "INTERNAL", message: "down" } });
    renderPanel(EXISTING, TWO_IMAGES);
    await user.click(screen.getByRole("button", { name: "Rimuovi foto-1.jpg" }));
    expect(await screen.findByText(dict.clientPanel.images.errors.remove)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Rimuovi foto-1.jpg" })).toBeTruthy();
    expect(counter().textContent).toBe("2 di 3");
  });

  it("announces a removal", async () => {
    const user = setup();
    renderPanel(EXISTING, TWO_IMAGES);
    await user.click(screen.getByRole("button", { name: "Rimuovi foto-1.jpg" }));
    await waitFor(() => expect(statusText()).toContain(fill(dict.clientPanel.images.announce.removed, { name: "foto-1.jpg" })));
  });

  it("refuses an empty file as a bad file, not a retry", async () => {
    const user = setup();
    renderPanel();
    await user.upload(imageInput(), new File([], "vuota.jpg", { type: "image/jpeg" }));
    expect(await screen.findByText(dict.clientPanel.images.errors.empty)).toBeTruthy();
    expect(counter().textContent).toBe("0 di 3");
  });

  it("notes on a non-image file that it does not count as an image", () => {
    renderPanel(EXISTING, [asset(1), asset(2, { kind: "document", contentType: "application/pdf", fileName: "brief.pdf", thumbnailUrl: null })]);
    expect(screen.getByText(dict.clientPanel.images.notCounted)).toBeTruthy();
  });
});

describe("ClientPanel, leaving", () => {
  const PANEL_URL = "/clients?nuovo=1";
  const popTo = (url: string) => {
    window.history.replaceState(null, "", url);
    const event = new PopStateEvent("popstate", { state: null });
    act(() => {
      window.dispatchEvent(event);
    });
  };

  it("asks before Back with entries; cancelled, the panel URL comes back and the router never hears it", () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    window.history.replaceState(null, "", PANEL_URL);
    const pushState = vi.spyOn(window.history, "pushState");
    const routerHeard = vi.fn();
    window.addEventListener("popstate", routerHeard);
    renderPanel();
    fireEvent.change(field("Nome"), { target: { value: "Lumen" } });
    popTo("/clients");
    window.removeEventListener("popstate", routerHeard);
    expect(window.confirm).toHaveBeenCalledWith(dict.wizard.unsavedConfirm);
    expect(pushState).toHaveBeenCalledTimes(1);
    expect(String(pushState.mock.calls[0][2])).toContain(PANEL_URL);
    expect(routerHeard).not.toHaveBeenCalled();
  });

  it("lets Back through after a confirmed discard, and without entries asks nothing", () => {
    window.history.replaceState(null, "", PANEL_URL);
    const pushState = vi.spyOn(window.history, "pushState");
    renderPanel();
    popTo("/clients");
    expect(window.confirm).not.toHaveBeenCalled();
    cleanup();

    window.history.replaceState(null, "", PANEL_URL);
    renderPanel();
    fireEvent.change(field("Nome"), { target: { value: "Lumen" } });
    popTo("/clients");
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(pushState).not.toHaveBeenCalled();
  });

  it("goes back instead of replacing when a link in the app opened the panel", async () => {
    const user = setup();
    markPanelOpenedInApp();
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Annulla" }));
    expect(back).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
  });

  it("does not write discarded brief text after a confirmed close", async () => {
    const user = setup();
    const { unmount } = renderPanel(EXISTING, TWO_IMAGES);
    fireEvent.change(field("Contesto"), { target: { value: "Da buttare." } });
    await user.click(screen.getByRole("button", { name: "Annulla" }));
    expect(window.confirm).toHaveBeenCalledWith(dict.wizard.unsavedConfirm);
    unmount();
    await new Promise((done) => setTimeout(done, DEBOUNCE_MS + 100));
    expect(saveClientBriefField).not.toHaveBeenCalled();
  });
});
