// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResult } from "@/app/_lib/action-result";
import type { Client, ClientDetail, PresignedClientLogoUpload } from "@/modules/case-study";

const createClient = vi.fn<(input: unknown) => Promise<ActionResult<Client>>>();
const updateClient = vi.fn<(input: unknown) => Promise<ActionResult<Client>>>();
const requestClientLogoUpload = vi.fn<(input: unknown) => Promise<ActionResult<PresignedClientLogoUpload>>>();
const confirmClientLogoUpload = vi.fn<(input: unknown) => Promise<ActionResult<{ logoId: string }>>>();
const uploadFile = vi.fn<(target: unknown, file: Blob) => Promise<void>>();

vi.mock("@/app/(tool)/clients/actions", () => ({
  createClient: (input: unknown) => createClient(input),
  updateClient: (input: unknown) => updateClient(input),
  requestClientLogoUpload: (input: unknown) => requestClientLogoUpload(input),
  confirmClientLogoUpload: (input: unknown) => confirmClientLogoUpload(input),
}));
vi.mock("@/app/(wizard)/_lib/upload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/(wizard)/_lib/upload")>()),
  uploadFile: (target: unknown, file: Blob) => uploadFile(target, file),
}));

const { ClientDialog } = await import("./client-dialog");

const LIMITS = {
  nameMax: 120,
  sectorMax: 60,
  descriptionMax: 400,
  logoTypes: ["image/png", "image/jpeg", "image/webp"],
  logoMaxBytes: 5 * 1024 * 1024,
  logoMinShortSide: 400,
};
const CLIENT_ID = "cccccccc-0000-4000-8000-000000000001";
const OLD_LOGO = "eeeeeeee-0000-4000-8000-000000000001";
const NEW_LOGO = "eeeeeeee-0000-4000-8000-000000000002";
const LUMEN: Client = { id: CLIENT_ID, name: "Lumen Srl", code: "LUM", sector: null, description: null, logoId: null };
const WITH_LOGO: ClientDetail = { ...LUMEN, sector: "Moda", description: "Brand.", logoId: OLD_LOGO, logoUrl: "https://x/old.png?sig" };
const PRESIGNED: PresignedClientLogoUpload = { logoId: NEW_LOGO, url: "https://x/upload", method: "PUT", headers: { "content-type": "image/png" } };

/** The pixel size `createImageBitmap` reports for the next picked file. */
let bitmap: { width: number; height: number } | "fail" = { width: 800, height: 400 };

const onClose = vi.fn();
const onSaved = vi.fn();

const png = (name = "logo.png", size = 2048, type = "image/png") => new File([new Uint8Array(size)], name, { type });
const field = (label: RegExp) => screen.getByLabelText(label) as HTMLInputElement;
const logoInput = () => document.querySelector("dialog input[type=file]") as HTMLInputElement;
const alertLine = () => screen.getByRole("alert").textContent;
const save = () => screen.getByRole("button", { name: /^(Aggiungi|Salva)$/ });
const describedText = (el: Element) =>
  (el.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" | ");
const setup = () => userEvent.setup({ applyAccept: false });

beforeEach(() => {
  for (const fn of [createClient, updateClient, requestClientLogoUpload, confirmClientLogoUpload, uploadFile, onClose, onSaved]) fn.mockReset();
  bitmap = { width: 800, height: 400 };
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => {
      if (bitmap === "fail") throw new Error("decode");
      return { ...bitmap, close: () => undefined };
    }),
  );
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
  uploadFile.mockResolvedValue(undefined);
  requestClientLogoUpload.mockResolvedValue({ ok: true, value: PRESIGNED });
  confirmClientLogoUpload.mockResolvedValue({ ok: true, value: { logoId: NEW_LOGO } });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ClientDialog fields", () => {
  it("opens an existing client with no info with empty fields", () => {
    render(<ClientDialog mode={{ kind: "edit", client: { ...LUMEN, logoUrl: null } }} limits={LIMITS} onClose={onClose} onSaved={onSaved} />);
    expect(field(/Settore/).value).toBe("");
    expect(field(/Descrizione/).value).toBe("");
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("button", { name: "Rimuovi" })).toBeNull();
  });

  it("labels every control and announces the description counter politely", () => {
    render(<ClientDialog mode={{ kind: "add" }} limits={LIMITS} onClose={onClose} onSaved={onSaved} />);
    const description = field(/Descrizione/);
    const counter = document.getElementById((description.getAttribute("aria-describedby") ?? "").split(" ")[0]);
    expect(counter?.getAttribute("aria-live")).toBe("polite");
    expect(counter?.textContent).toBe("0/400");
    expect(screen.getByRole("button", { name: "Scegli il logo" }).getAttribute("aria-describedby")).not.toBeNull();
  });

  it("counts 400 emoji as 400/400 and saves them", async () => {
    const user = setup();
    createClient.mockResolvedValue({ ok: true, value: LUMEN });
    render(<ClientDialog mode={{ kind: "add" }} limits={LIMITS} onClose={onClose} onSaved={onSaved} />);
    fireEvent.change(field(/Nome del cliente/), { target: { value: "Lumen Srl" } });
    fireEvent.change(field(/Descrizione/), { target: { value: "😀".repeat(400) } });
    expect(describedText(field(/Descrizione/))).toContain("400/400");
    await user.click(save());
    expect(createClient).toHaveBeenCalledWith({ name: "Lumen Srl", sector: null, description: "😀".repeat(400) });
  });

  it.each([
    [/Descrizione/, 401],
    [/Settore/, 61],
  ])("shows an inline error for %s over its limit and sends nothing", async (label, length) => {
    const user = setup();
    render(<ClientDialog mode={{ kind: "add" }} limits={LIMITS} onClose={onClose} onSaved={onSaved} />);
    fireEvent.change(field(/Nome del cliente/), { target: { value: "Lumen Srl" } });
    fireEvent.change(field(label), { target: { value: "x".repeat(length) } });
    await user.click(save());
    expect(createClient).not.toHaveBeenCalled();
    expect(field(label).getAttribute("aria-invalid")).toBe("true");
    expect(describedText(field(label))).toMatch(/Massimo (60|400) caratteri\./);
    expect(document.activeElement).toBe(field(label));
  });

  it("accepts a 60-character sector and sends blank fields as null", async () => {
    const user = setup();
    createClient.mockResolvedValue({ ok: true, value: LUMEN });
    render(<ClientDialog mode={{ kind: "add" }} limits={LIMITS} onClose={onClose} onSaved={onSaved} />);
    fireEvent.change(field(/Nome del cliente/), { target: { value: "Lumen Srl" } });
    fireEvent.change(field(/Settore/), { target: { value: "s".repeat(60) } });
    fireEvent.change(field(/Descrizione/), { target: { value: "   " } });
    await user.click(save());
    expect(createClient).toHaveBeenCalledWith({ name: "Lumen Srl", sector: "s".repeat(60), description: null });
    expect(onSaved).toHaveBeenCalledWith(LUMEN);
  });

  it("maps a server CLIENT_FIELD_TOO_LONG to the named field", async () => {
    const user = setup();
    updateClient.mockResolvedValue({ ok: false, status: 400, error: { code: "CLIENT_FIELD_TOO_LONG", message: "m", fields: ["description"] } });
    render(<ClientDialog mode={{ kind: "edit", client: { ...LUMEN, logoUrl: null } }} limits={LIMITS} onClose={onClose} onSaved={onSaved} />);
    await user.click(save());
    expect(field(/Descrizione/).getAttribute("aria-invalid")).toBe("true");
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe("ClientDialog logo checks in the browser", () => {
  it.each([
    ["an SVG", png("logo.svg", 100, "image/svg+xml")],
    ["a GIF", png("logo.gif", 100, "image/gif")],
    ["a PDF", png("logo.pdf", 100, "application/pdf")],
  ])("rejects %s inline and uploads nothing", async (_label, file) => {
    const user = setup();
    render(<ClientDialog mode={{ kind: "add" }} limits={LIMITS} onClose={onClose} onSaved={onSaved} />);
    await user.upload(logoInput(), file);
    const choose = screen.getByRole("button", { name: "Scegli il logo" });
    expect(describedText(choose)).toContain("Formato non supportato. Usa un file PNG, JPEG o WebP.");
    expect(screen.queryByRole("img")).toBeNull();
    createClient.mockResolvedValue({ ok: true, value: LUMEN });
    fireEvent.change(field(/Nome del cliente/), { target: { value: "Lumen Srl" } });
    await user.click(save());
    expect(requestClientLogoUpload).not.toHaveBeenCalled();
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it("rejects a file over 5 MB", async () => {
    const user = setup();
    render(<ClientDialog mode={{ kind: "add" }} limits={LIMITS} onClose={onClose} onSaved={onSaved} />);
    await user.upload(logoInput(), png("big.png", 5 * 1024 * 1024 + 1));
    expect(describedText(screen.getByRole("button", { name: "Scegli il logo" }))).toContain("Il logo supera 5 MB.");
  });

  it.each([
    [{ width: 1200, height: 300 }, "Il logo deve misurare almeno 400 px sul lato corto."],
    [{ width: 399, height: 1200 }, "Il logo deve misurare almeno 400 px sul lato corto."],
  ])("rejects an image of %j", async (size, message) => {
    bitmap = size;
    const user = setup();
    render(<ClientDialog mode={{ kind: "add" }} limits={LIMITS} onClose={onClose} onSaved={onSaved} />);
    await user.upload(logoInput(), png());
    expect(describedText(screen.getByRole("button", { name: "Scegli il logo" }))).toContain(message);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("hides the file input from assistive tech: the Scegli il logo button is the one control", () => {
    render(<ClientDialog mode={{ kind: "add" }} limits={LIMITS} onClose={onClose} onSaved={onSaved} />);
    expect(logoInput().getAttribute("aria-hidden")).toBe("true");
    expect(logoInput().hasAttribute("aria-label")).toBe(false);
    expect(screen.getAllByRole("button", { name: "Scegli il logo" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Scegli il logo" }).hasAttribute("aria-invalid")).toBe(false);
  });

  it("accepts a file the browser can't decode and lets the server decide", async () => {
    bitmap = "fail";
    const user = setup();
    render(<ClientDialog mode={{ kind: "add" }} limits={LIMITS} onClose={onClose} onSaved={onSaved} />);
    await user.upload(logoInput(), png("logo.webp", 2048, "image/webp"));
    expect(screen.getByRole("img", { name: /^Logo/ }).getAttribute("src")).toBe("blob:preview");
  });

  it("ignores an older pick that finishes measuring after a newer one", async () => {
    let releaseFirst: () => void = () => undefined;
    let calls = 0;
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        calls += 1;
        if (calls === 1) await new Promise<void>((r) => (releaseFirst = r));
        return { width: 800, height: 400, close: () => undefined };
      }),
    );
    let n = 0;
    URL.createObjectURL = vi.fn(() => `blob:${++n}`);
    render(<ClientDialog mode={{ kind: "add" }} limits={LIMITS} onClose={onClose} onSaved={onSaved} />);
    const first = png("first.png");
    const second = png("second.png");
    fireEvent.change(logoInput(), { target: { files: [first] } });
    fireEvent.change(logoInput(), { target: { files: [second] } });
    await waitFor(() => expect(screen.getByRole("img", { name: /^Logo/ }).getAttribute("src")).toBe("blob:1"));
    releaseFirst();
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByRole("img", { name: /^Logo/ }).getAttribute("src")).toBe("blob:1");
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
  });

  it("hides the tile when the logo image fails to load (expired signed URL)", () => {
    render(<ClientDialog mode={{ kind: "edit", client: WITH_LOGO }} limits={LIMITS} onClose={onClose} onSaved={onSaved} />);
    fireEvent.error(screen.getByRole("img", { name: "Logo Lumen Srl" }));
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByRole("button", { name: "Rimuovi" })).not.toBeNull();
  });

  it("previews an accepted logo on a white tile with its alt text", async () => {
    const user = setup();
    render(<ClientDialog mode={{ kind: "add" }} limits={LIMITS} onClose={onClose} onSaved={onSaved} />);
    fireEvent.change(field(/Nome del cliente/), { target: { value: "Lumen Srl" } });
    await user.upload(logoInput(), png());
    const img = screen.getByRole("img", { name: "Logo Lumen Srl" });
    expect(img.getAttribute("src")).toBe("blob:preview");
    expect(img.parentElement?.className).toContain("bg-logo-tile");
    expect(screen.getByRole("button", { name: "Rimuovi" })).not.toBeNull();
  });
});

describe("ClientDialog save order", () => {
  it("adds the client, then presigns, PUTs, confirms and links the logo", async () => {
    const user = setup();
    createClient.mockResolvedValue({ ok: true, value: LUMEN });
    updateClient.mockResolvedValue({ ok: true, value: { ...LUMEN, sector: "Moda", logoId: NEW_LOGO } });
    render(<ClientDialog mode={{ kind: "add" }} limits={LIMITS} onClose={onClose} onSaved={onSaved} />);
    fireEvent.change(field(/Nome del cliente/), { target: { value: "Lumen Srl" } });
    fireEvent.change(field(/Settore/), { target: { value: "Moda" } });
    const file = png();
    await user.upload(logoInput(), file);
    await user.click(save());
    expect(createClient).toHaveBeenCalledExactlyOnceWith({ name: "Lumen Srl", sector: "Moda", description: null });
    expect(requestClientLogoUpload).toHaveBeenCalledExactlyOnceWith({ clientId: CLIENT_ID, contentType: "image/png", sizeBytes: 2048 });
    expect(uploadFile).toHaveBeenCalledWith({ url: PRESIGNED.url, method: "PUT", headers: PRESIGNED.headers }, file);
    expect(confirmClientLogoUpload).toHaveBeenCalledExactlyOnceWith({ clientId: CLIENT_ID, logoId: NEW_LOGO, contentType: "image/png" });
    expect(updateClient).toHaveBeenCalledExactlyOnceWith({ clientId: CLIENT_ID, name: "Lumen Srl", sector: "Moda", description: null, logoId: NEW_LOGO });
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ ...LUMEN, sector: "Moda", logoId: NEW_LOGO }));
  });

  it("keeps the added client when the logo fails, switches to edit mode, and Save retries the logo only", async () => {
    const user = setup();
    createClient.mockResolvedValue({ ok: true, value: LUMEN });
    uploadFile.mockRejectedValueOnce(new Error("network"));
    render(<ClientDialog mode={{ kind: "add" }} limits={LIMITS} onClose={onClose} onSaved={onSaved} />);
    fireEvent.change(field(/Nome del cliente/), { target: { value: "Lumen Srl" } });
    await user.upload(logoInput(), png());
    await user.click(save());
    await screen.findByRole("dialog", { name: "Modifica cliente" });
    const choose = screen.getByRole("button", { name: "Sostituisci il logo" });
    expect(describedText(choose)).toContain("Non è stato possibile caricare il logo.");
    expect(document.activeElement).toBe(choose);
    expect(updateClient).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();

    updateClient.mockResolvedValue({ ok: true, value: { ...LUMEN, logoId: NEW_LOGO } });
    await user.click(save());
    expect(createClient).toHaveBeenCalledOnce();
    expect(requestClientLogoUpload).toHaveBeenCalledTimes(2);
    expect(updateClient).toHaveBeenCalledExactlyOnceWith({ clientId: CLIENT_ID, name: "Lumen Srl", sector: null, description: null, logoId: NEW_LOGO });
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  });

  it("refreshes the page when the dialog is closed after a partial add", async () => {
    const user = setup();
    createClient.mockResolvedValue({ ok: true, value: LUMEN });
    confirmClientLogoUpload.mockResolvedValue({ ok: false, status: 400, error: { code: "CLIENT_LOGO_INVALID", message: "m" } });
    render(<ClientDialog mode={{ kind: "add" }} limits={LIMITS} onClose={onClose} onSaved={onSaved} />);
    fireEvent.change(field(/Nome del cliente/), { target: { value: "Lumen Srl" } });
    await user.upload(logoInput(), png());
    await user.click(save());
    await screen.findByRole("dialog", { name: "Modifica cliente" });
    await user.click(screen.getByRole("button", { name: "Annulla" }));
    expect(onSaved).toHaveBeenCalledWith(LUMEN);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows the current logo on a white tile, and Rimuovi then Save clears logo_id", async () => {
    const user = setup();
    updateClient.mockResolvedValue({ ok: true, value: { ...WITH_LOGO, logoId: null } });
    render(<ClientDialog mode={{ kind: "edit", client: WITH_LOGO }} limits={LIMITS} onClose={onClose} onSaved={onSaved} />);
    const img = screen.getByRole("img", { name: "Logo Lumen Srl" });
    expect(img.getAttribute("src")).toBe(WITH_LOGO.logoUrl);
    expect(img.parentElement?.className).toContain("bg-logo-tile");
    await user.click(screen.getByRole("button", { name: "Rimuovi" }));
    expect(screen.queryByRole("img")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Scegli il logo" }));
    await user.click(save());
    expect(updateClient).toHaveBeenCalledExactlyOnceWith({ clientId: CLIENT_ID, name: "Lumen Srl", sector: "Moda", description: "Brand.", logoId: null });
    expect(requestClientLogoUpload).not.toHaveBeenCalled();
  });

  it("replaces the logo: saves the fields with the old logo, uploads, then links the new one", async () => {
    const user = setup();
    updateClient.mockImplementation(async (input) => ({ ok: true, value: { ...WITH_LOGO, logoId: (input as { logoId: string }).logoId } }));
    render(<ClientDialog mode={{ kind: "edit", client: WITH_LOGO }} limits={LIMITS} onClose={onClose} onSaved={onSaved} />);
    await user.upload(logoInput(), png());
    expect(screen.getByRole("img", { name: "Logo Lumen Srl" }).getAttribute("src")).toBe("blob:preview");
    await user.click(save());
    expect(updateClient.mock.calls.map(([input]) => (input as { logoId: string }).logoId)).toEqual([OLD_LOGO, NEW_LOGO]);
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  });

  it("leaves logo_id unchanged when the replacement upload fails", async () => {
    const user = setup();
    updateClient.mockResolvedValue({ ok: true, value: { ...WITH_LOGO } });
    uploadFile.mockRejectedValue(new Error("network"));
    render(<ClientDialog mode={{ kind: "edit", client: WITH_LOGO }} limits={LIMITS} onClose={onClose} onSaved={onSaved} />);
    await user.upload(logoInput(), png());
    await user.click(save());
    await waitFor(() => expect(describedText(screen.getByRole("button", { name: "Sostituisci il logo" }))).toContain("Non è stato possibile caricare il logo."));
    expect(updateClient.mock.calls.map(([input]) => (input as { logoId: string }).logoId)).toEqual([OLD_LOGO]);
    expect(confirmClientLogoUpload).not.toHaveBeenCalled();
  });

  it("after confirm succeeds but the link fails, Save only links the confirmed logo again", async () => {
    const user = setup();
    createClient.mockResolvedValue({ ok: true, value: LUMEN });
    updateClient
      .mockResolvedValueOnce({ ok: false, status: 500, error: { code: "CLIENT_WRITE_FAILED", message: "m" } })
      .mockResolvedValueOnce({ ok: true, value: { ...LUMEN, logoId: NEW_LOGO } });
    render(<ClientDialog mode={{ kind: "add" }} limits={LIMITS} onClose={onClose} onSaved={onSaved} />);
    fireEvent.change(field(/Nome del cliente/), { target: { value: "Lumen Srl" } });
    await user.upload(logoInput(), png());
    await user.click(save());
    await screen.findByRole("dialog", { name: "Modifica cliente" });
    expect(describedText(screen.getByRole("button", { name: "Sostituisci il logo" }))).toContain("Non è stato possibile caricare il logo.");
    await user.click(save());
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(requestClientLogoUpload).toHaveBeenCalledOnce();
    expect(uploadFile).toHaveBeenCalledOnce();
    expect(confirmClientLogoUpload).toHaveBeenCalledOnce();
    expect(updateClient.mock.calls.map(([input]) => (input as { logoId: string }).logoId)).toEqual([NEW_LOGO, NEW_LOGO]);
  });

  it.each([
    ["presign", () => requestClientLogoUpload.mockResolvedValue({ ok: false, status: 400, error: { code: "CLIENT_LOGO_INVALID", message: "m" } })],
    ["confirm", () => confirmClientLogoUpload.mockResolvedValue({ ok: false, status: 400, error: { code: "CLIENT_LOGO_INVALID", message: "m" } })],
  ])("a %s CLIENT_LOGO_INVALID shows the unreadable-image message on the logo control", async (_label, refuse) => {
    refuse();
    const user = setup();
    updateClient.mockResolvedValue({ ok: true, value: { ...WITH_LOGO } });
    render(<ClientDialog mode={{ kind: "edit", client: WITH_LOGO }} limits={LIMITS} onClose={onClose} onSaved={onSaved} />);
    await user.upload(logoInput(), png());
    await user.click(save());
    await waitFor(() =>
      expect(describedText(screen.getByRole("button", { name: "Sostituisci il logo" }))).toContain(
        "Non è stato possibile leggere l'immagine",
      ),
    );
    expect(alertLine()).toBe("");
  });

  it.each([
    ["CLIENT_NOT_FOUND", 404],
    ["FORBIDDEN", 403],
  ])("a presign %s shows the generic error, not a retry hint", async (code, status) => {
    requestClientLogoUpload.mockResolvedValue({ ok: false, status, error: { code, message: "m" } });
    const user = setup();
    updateClient.mockResolvedValue({ ok: true, value: { ...WITH_LOGO } });
    render(<ClientDialog mode={{ kind: "edit", client: WITH_LOGO }} limits={LIMITS} onClose={onClose} onSaved={onSaved} />);
    await user.upload(logoInput(), png());
    await user.click(save());
    await waitFor(() => expect(alertLine()).toBe("Non è stato possibile salvare. Riprova."));
    expect(describedText(screen.getByRole("button", { name: "Sostituisci il logo" }))).not.toContain("premi Salva");
  });

  it("in edit mode, a first-save CLIENT_LOGO_INVALID shows on the logo control and leaves the alert line empty", async () => {
    updateClient.mockResolvedValue({ ok: false, status: 400, error: { code: "CLIENT_LOGO_INVALID", message: "m" } });
    const user = setup();
    render(<ClientDialog mode={{ kind: "edit", client: WITH_LOGO }} limits={LIMITS} onClose={onClose} onSaved={onSaved} />);
    await user.click(save());
    await waitFor(() =>
      expect(describedText(screen.getByRole("button", { name: "Sostituisci il logo" }))).toContain(
        "Non è stato possibile leggere l'immagine",
      ),
    );
    expect(alertLine()).toBe("");
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("while a save runs: Annulla, Esc, a second submit and logo changes are ignored", async () => {
    let resolve: (value: ActionResult<Client>) => void = () => undefined;
    updateClient.mockReturnValue(new Promise((r) => (resolve = r)));
    const user = setup();
    render(<ClientDialog mode={{ kind: "edit", client: WITH_LOGO }} limits={LIMITS} onClose={onClose} onSaved={onSaved} />);
    await user.click(save());
    expect(save().getAttribute("aria-busy")).toBe("true");
    await user.click(screen.getByRole("button", { name: "Annulla" }));
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    await user.click(save());
    await user.click(screen.getByRole("button", { name: "Rimuovi" }));
    await user.upload(logoInput(), png());
    expect(onClose).not.toHaveBeenCalled();
    expect(updateClient).toHaveBeenCalledOnce();
    expect(screen.getByRole("img", { name: "Logo Lumen Srl" }).getAttribute("src")).toBe(WITH_LOGO.logoUrl);
    resolve({ ok: true, value: { ...WITH_LOGO } });
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(requestClientLogoUpload).not.toHaveBeenCalled();
  });
});
