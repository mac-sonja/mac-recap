// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResult } from "@/app/_lib/action-result";
import type { Client, ClientBriefFieldSaved, ClientDetail, ClientIndustry, PresignedClientLogoUpload } from "@/modules/case-study";

const push = vi.fn();
const createClient = vi.fn<(input: unknown) => Promise<ActionResult<Client>>>();
const updateClient = vi.fn<(input: unknown) => Promise<ActionResult<Client>>>();
const saveClientBriefField = vi.fn<(input: unknown) => Promise<ActionResult<ClientBriefFieldSaved>>>();
const requestClientLogoUpload = vi.fn<(input: unknown) => Promise<ActionResult<PresignedClientLogoUpload>>>();
const confirmClientLogoUpload = vi.fn<(input: unknown) => Promise<ActionResult<{ logoId: string }>>>();
const uploadFile = vi.fn<(target: unknown, file: Blob) => Promise<void>>();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/app/(tool)/clients/actions", () => ({
  createClient: (input: unknown) => createClient(input),
  updateClient: (input: unknown) => updateClient(input),
  saveClientBriefField: (input: unknown) => saveClientBriefField(input),
  requestClientLogoUpload: (input: unknown) => requestClientLogoUpload(input),
  confirmClientLogoUpload: (input: unknown) => confirmClientLogoUpload(input),
}));
vi.mock("@/app/(wizard)/_lib/upload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/(wizard)/_lib/upload")>()),
  uploadFile: (target: unknown, file: Blob) => uploadFile(target, file),
}));

const { ClientDetailsStep } = await import("./client-details-step");
const { DEBOUNCE_MS } = await import("@/app/(wizard)/_components/use-autosave-fields");

const INDUSTRIES: ClientIndustry[] = ["interior_design", "energia", "risorse_umane", "lusso"];
const LIMITS = {
  nameMax: 120,
  descriptionMax: 400,
  briefMax: 5000,
  logoTypes: ["image/png", "image/jpeg", "image/webp", "image/svg+xml"],
  logoMaxBytes: 5 * 1024 * 1024,
  logoMinShortSide: 400,
};
const CLIENT_ID = "cccccccc-0000-4000-8000-000000000001";
const OLD_LOGO = "eeeeeeee-0000-4000-8000-000000000001";
const NEW_LOGO = "eeeeeeee-0000-4000-8000-000000000002";
const CREATED: Client = { id: CLIENT_ID, name: "Lumen Srl", code: "LUM", industries: ["energia", "lusso"], description: "Brand.", logoId: null };
const EXISTING: ClientDetail = {
  ...CREATED,
  logoId: OLD_LOGO,
  logoUrl: "https://x/old.png?sig",
  brief: { context: "Contesto.", solution: "Soluzione.", results: "Risultati." },
};
const LEGACY: ClientDetail = {
  id: CLIENT_ID,
  name: "Lumen Srl",
  code: "LUM",
  industries: [],
  description: "Brand.",
  logoId: null,
  logoUrl: null,
  brief: { context: "", solution: "", results: "" },
};
const PRESIGNED: PresignedClientLogoUpload = { logoId: NEW_LOGO, url: "https://x/upload", method: "PUT", headers: { "content-type": "image/png" } };
const STEP_2 = `/clients/new?clientId=${CLIENT_ID}&step=2`;

const png = () => new File([new Uint8Array(2048)], "logo.png", { type: "image/png" });
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement | HTMLTextAreaElement;
const pill = (name: string) => screen.getByRole("button", { name });
const next = () => screen.getByRole("button", { name: "Avanti" });
const logoInput = () => document.querySelector("input[type=file]") as HTMLInputElement;
const describedText = (el: Element) =>
  (el.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" | ");
const setup = () => userEvent.setup({ applyAccept: false });
const renderStep = (client: ClientDetail | null = null) =>
  render(<ClientDetailsStep client={client} industries={INDUSTRIES} limits={LIMITS} />);

/** Fills every field of a new client and picks a logo. */
async function fillAll(user: ReturnType<typeof setup>) {
  fireEvent.change(field("Nome"), { target: { value: " Lumen Srl " } });
  await user.click(pill("Lusso"));
  await user.click(pill("Energia"));
  fireEvent.change(field("Descrizione"), { target: { value: " Brand. " } });
  await user.upload(logoInput(), png());
  await waitFor(() => expect(screen.getByRole("img")).toBeTruthy());
  fireEvent.change(field("Contesto"), { target: { value: "C" } });
  fireEvent.change(field("Soluzione"), { target: { value: "S" } });
  fireEvent.change(field("Risultati"), { target: { value: "R" } });
}

beforeEach(() => {
  for (const fn of [push, createClient, updateClient, saveClientBriefField, requestClientLogoUpload, confirmClientLogoUpload, uploadFile]) {
    fn.mockReset();
  }
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width: 800, height: 400, close: () => undefined })),
  );
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(window.history, "replaceState");
  createClient.mockResolvedValue({ ok: true, value: CREATED });
  updateClient.mockImplementation(async (input) => ({ ok: true, value: { ...CREATED, logoId: (input as { logoId: string }).logoId } }));
  saveClientBriefField.mockImplementation(async (input) => {
    const { field: key, text } = input as ClientBriefFieldSaved;
    return { ok: true, value: { field: key, text } };
  });
  requestClientLogoUpload.mockResolvedValue({ ok: true, value: PRESIGNED });
  uploadFile.mockResolvedValue(undefined);
  confirmClientLogoUpload.mockResolvedValue({ ok: true, value: { logoId: NEW_LOGO } });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ClientDetailsStep fields", () => {
  it("shows Nome, Settore pills, Descrizione, Logo and the three texts in order, all empty, with no code field", () => {
    renderStep();
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("I dati del cliente");
    const group = screen.getByRole("group", { name: "Settore" });
    expect(within(group).getAllByRole("button").map((b) => [b.textContent, b.getAttribute("aria-pressed")])).toEqual([
      ["Interior design", "false"],
      ["Energia", "false"],
      ["Risorse umane", "false"],
      ["Lusso", "false"],
    ]);
    expect(screen.getAllByRole("textbox").map((t) => t.getAttribute("name"))).toEqual(["name", "description", "context", "solution", "results"]);
    expect(field("Contesto").getAttribute("placeholder")).not.toBe("");
    expect(screen.getByRole("button", { name: "Scegli il logo" })).toBeTruthy();
    expect(screen.queryByLabelText(/codice/i)).toBeNull();
    expect(screen.queryByText(/Il codice/)).toBeNull();
    expect(describedText(field("Descrizione"))).toContain("0/400");
  });

  it("keeps Avanti inactive with the reason naming the empty fields, linked by aria-describedby", async () => {
    const user = setup();
    renderStep();
    expect(next().getAttribute("aria-disabled")).toBe("true");
    expect(describedText(next())).toBe("Per continuare compila: Nome, Settore, Descrizione, Logo, Contesto, Soluzione, Risultati.");
    await user.click(next());
    expect(createClient).not.toHaveBeenCalled();
    await fillAll(user);
    expect(next().hasAttribute("aria-disabled")).toBe(false);
    expect(next().hasAttribute("aria-describedby")).toBe(false);
    // Unselecting the only pills empties Settore again.
    await user.click(pill("Lusso"));
    await user.click(pill("Energia"));
    expect(describedText(next())).toBe("Per continuare compila: Settore.");
  });

  it("toggles pills as a multiselect", async () => {
    const user = setup();
    renderStep();
    await user.click(pill("Energia"));
    await user.click(pill("Lusso"));
    expect(pill("Energia").getAttribute("aria-pressed")).toBe("true");
    expect(pill("Lusso").getAttribute("aria-pressed")).toBe("true");
    await user.click(pill("Energia"));
    expect(pill("Energia").getAttribute("aria-pressed")).toBe("false");
  });

  it("shows an inline error for a 401-character description and sends nothing", async () => {
    const user = setup();
    renderStep();
    await fillAll(user);
    fireEvent.change(field("Descrizione"), { target: { value: "x".repeat(401) } });
    await user.click(next());
    expect(createClient).not.toHaveBeenCalled();
    expect(field("Descrizione").getAttribute("aria-invalid")).toBe("true");
    expect(describedText(field("Descrizione"))).toContain("Massimo 400 caratteri.");
    expect(document.activeElement).toBe(field("Descrizione"));
  });

  it("shows an inline error for a 5001-character text and sends nothing", async () => {
    const user = setup();
    renderStep();
    await fillAll(user);
    fireEvent.change(field("Risultati"), { target: { value: "x".repeat(5001) } });
    expect(describedText(field("Risultati"))).toBe("Massimo 5000 caratteri.");
    await user.click(next());
    expect(createClient).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(field("Risultati"));
  });
});

describe("ClientDetailsStep on a new client", () => {
  it("creates the client, uploads and links the logo, saves the three texts, then opens step 2", async () => {
    const user = setup();
    renderStep();
    await fillAll(user);
    // No autosave before the client exists.
    expect(saveClientBriefField).not.toHaveBeenCalled();
    await user.click(next());
    await waitFor(() => expect(push).toHaveBeenCalledWith(STEP_2));
    expect(createClient).toHaveBeenCalledExactlyOnceWith({ name: "Lumen Srl", industries: ["energia", "lusso"], description: "Brand." });
    expect(requestClientLogoUpload).toHaveBeenCalledExactlyOnceWith({ clientId: CLIENT_ID, contentType: "image/png", sizeBytes: 2048 });
    expect(confirmClientLogoUpload).toHaveBeenCalledExactlyOnceWith({ clientId: CLIENT_ID, logoId: NEW_LOGO, contentType: "image/png" });
    expect(updateClient).toHaveBeenCalledExactlyOnceWith({
      clientId: CLIENT_ID,
      name: "Lumen Srl",
      industries: ["energia", "lusso"],
      description: "Brand.",
      logoId: NEW_LOGO,
    });
    expect(saveClientBriefField.mock.calls.map(([input]) => input)).toEqual([
      { clientId: CLIENT_ID, field: "context", text: "C" },
      { clientId: CLIENT_ID, field: "solution", text: "S" },
      { clientId: CLIENT_ID, field: "results", text: "R" },
    ]);
    expect(window.history.replaceState).toHaveBeenCalledWith(null, "", `/clients/new?clientId=${CLIENT_ID}`);
    expect(createClient.mock.invocationCallOrder[0]).toBeLessThan(requestClientLogoUpload.mock.invocationCallOrder[0]);
    expect(updateClient.mock.invocationCallOrder[0]).toBeLessThan(saveClientBriefField.mock.invocationCallOrder[0]);
  });

  it("shows a duplicate name on Nome and writes nothing else", async () => {
    const user = setup();
    createClient.mockResolvedValue({ ok: false, status: 409, error: { code: "CLIENT_NAME_TAKEN", message: "m" } });
    renderStep();
    await fillAll(user);
    await user.click(next());
    await waitFor(() => expect(field("Nome").getAttribute("aria-invalid")).toBe("true"));
    expect(describedText(field("Nome"))).toBe("Esiste già un cliente con questo nome.");
    expect(requestClientLogoUpload).not.toHaveBeenCalled();
    expect(saveClientBriefField).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("keeps the client when the logo upload fails; Avanti then retries the logo only", async () => {
    const user = setup();
    uploadFile.mockRejectedValueOnce(new Error("network"));
    renderStep();
    await fillAll(user);
    await user.click(next());
    await waitFor(() => expect(screen.getByText(/Non è stato possibile caricare il logo/)).toBeTruthy());
    expect(push).not.toHaveBeenCalled();
    expect(saveClientBriefField).not.toHaveBeenCalled();
    // The client exists now: the code note shows and the URL names it.
    expect(screen.getByText(/Il codice LUM non cambia/)).toBeTruthy();
    await user.click(next());
    await waitFor(() => expect(push).toHaveBeenCalledWith(STEP_2));
    expect(createClient).toHaveBeenCalledOnce();
    expect(requestClientLogoUpload).toHaveBeenCalledTimes(2);
  });

  it("re-links a confirmed logo without uploading it again when the link failed", async () => {
    const user = setup();
    updateClient.mockResolvedValueOnce({ ok: false, status: 500, error: { code: "CLIENT_WRITE_FAILED", message: "m" } });
    renderStep();
    await fillAll(user);
    await user.click(next());
    await waitFor(() => expect(screen.getByText(/Non è stato possibile caricare il logo/)).toBeTruthy());
    await user.click(next());
    await waitFor(() => expect(push).toHaveBeenCalledWith(STEP_2));
    expect(requestClientLogoUpload).toHaveBeenCalledOnce();
    expect(confirmClientLogoUpload).toHaveBeenCalledOnce();
    expect(updateClient).toHaveBeenCalledTimes(2);
  });

  it("stays and focuses the text when a text save fails after the client is created", async () => {
    const user = setup();
    saveClientBriefField.mockImplementation(async (input) => {
      const { field: key, text } = input as ClientBriefFieldSaved;
      return key === "solution" ? { ok: false, status: 500, error: { code: "CLIENT_WRITE_FAILED", message: "m" } } : { ok: true, value: { field: key, text } };
    });
    renderStep();
    await fillAll(user);
    await user.click(next());
    await waitFor(() => expect(document.activeElement).toBe(field("Soluzione")));
    expect(describedText(field("Soluzione"))).toBe("Non salvato. Riprova modificando il testo.");
    expect(push).not.toHaveBeenCalled();
    expect(createClient).toHaveBeenCalledOnce();
  });

  it("shows the generic line for another refusal", async () => {
    const user = setup();
    createClient.mockResolvedValue({ ok: false, status: 403, error: { code: "FORBIDDEN", message: "m" } });
    renderStep();
    await fillAll(user);
    await user.click(next());
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Non è stato possibile salvare. Riprova."));
  });
});

describe("ClientDetailsStep on an existing client", () => {
  it("prefills every field, states the code stays, and goes to step 2 without saving when nothing changed", async () => {
    const user = setup();
    renderStep(EXISTING);
    expect(screen.getByText("Il codice LUM non cambia. Le modifiche si vedono in tutte le sue case history.")).toBeTruthy();
    expect(field("Nome").value).toBe("Lumen Srl");
    expect(pill("Energia").getAttribute("aria-pressed")).toBe("true");
    expect(pill("Interior design").getAttribute("aria-pressed")).toBe("false");
    expect(field("Contesto").value).toBe("Contesto.");
    expect(screen.getByRole("img").getAttribute("src")).toBe("https://x/old.png?sig");
    expect(screen.getByRole("button", { name: "Sostituisci il logo" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Rimuovi" })).toBeNull();
    await user.click(next());
    await waitFor(() => expect(push).toHaveBeenCalledWith(STEP_2));
    expect(updateClient).not.toHaveBeenCalled();
    expect(saveClientBriefField).not.toHaveBeenCalled();
  });

  it("autosaves a text after the debounce, and saves name and industries only on Avanti", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderStep(EXISTING);
    fireEvent.change(field("Risultati"), { target: { value: "Più clienti." } });
    fireEvent.change(field("Nome"), { target: { value: "Lumen S.r.l." } });
    await act(() => vi.advanceTimersByTimeAsync(DEBOUNCE_MS));
    expect(saveClientBriefField).toHaveBeenCalledExactlyOnceWith({ clientId: CLIENT_ID, field: "results", text: "Più clienti." });
    expect(updateClient).not.toHaveBeenCalled();
    fireEvent.click(next());
    await waitFor(() => expect(push).toHaveBeenCalledWith(STEP_2));
    expect(updateClient).toHaveBeenCalledExactlyOnceWith({
      clientId: CLIENT_ID,
      name: "Lumen S.r.l.",
      industries: ["energia", "lusso"],
      description: "Brand.",
      logoId: OLD_LOGO,
    });
  });

  it("saves a text on blur", async () => {
    renderStep(EXISTING);
    fireEvent.change(field("Contesto"), { target: { value: "Nuovo contesto." } });
    fireEvent.blur(field("Contesto"));
    await waitFor(() =>
      expect(saveClientBriefField).toHaveBeenCalledExactlyOnceWith({ clientId: CLIENT_ID, field: "context", text: "Nuovo contesto." }),
    );
  });

  it("opens a legacy client with what it has; Avanti stays inactive until the rest is filled", async () => {
    const user = setup();
    renderStep(LEGACY);
    expect(field("Descrizione").value).toBe("Brand.");
    expect(describedText(next())).toBe("Per continuare compila: Settore, Logo, Contesto, Soluzione, Risultati.");
    await user.click(pill("Interior design"));
    await user.upload(logoInput(), png());
    await waitFor(() => expect(screen.getByRole("img")).toBeTruthy());
    fireEvent.change(field("Contesto"), { target: { value: "C" } });
    fireEvent.change(field("Soluzione"), { target: { value: "S" } });
    fireEvent.change(field("Risultati"), { target: { value: "R" } });
    await user.click(next());
    await waitFor(() => expect(push).toHaveBeenCalledWith(STEP_2));
    expect(createClient).not.toHaveBeenCalled();
    expect(updateClient).toHaveBeenCalledExactlyOnceWith({
      clientId: CLIENT_ID,
      name: "Lumen Srl",
      industries: ["interior_design"],
      description: "Brand.",
      logoId: NEW_LOGO,
    });
  });

  it("refuses a logo under 400 px on the short side before any upload", async () => {
    const user = setup();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 800, height: 399, close: () => undefined })),
    );
    renderStep(LEGACY);
    await user.upload(logoInput(), png());
    await waitFor(() => expect(screen.getByText("Il logo deve misurare almeno 400 px sul lato corto.")).toBeTruthy());
    expect(requestClientLogoUpload).not.toHaveBeenCalled();
    expect(describedText(next())).toContain("Logo");
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const file = (name: string, size: number, type: string) => new File([new Uint8Array(size)], name, { type });
const chooseButton = () => screen.getByRole("button", { name: /il logo$/ });
const click = (link: HTMLElement) => {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
  act(() => {
    link.dispatchEvent(event);
  });
  return event;
};

describe("ClientDetailsStep logo pick", () => {
  it.each([
    ["an unsupported type", () => file("logo.gif", 2048, "image/gif"), "Formato non supportato. Usa un file PNG, JPEG, WebP o SVG."],
    ["an empty file", () => file("logo.png", 0, "image/png"), "Il file è vuoto."],
    ["a file over 5 MB", () => file("logo.png", 5 * 1024 * 1024 + 1, "image/png"), "Il logo supera 5 MB."],
  ])("refuses %s with its message and uploads nothing", async (_label, make, message) => {
    const user = setup();
    renderStep(LEGACY);
    await user.upload(logoInput(), make());
    await waitFor(() => expect(describedText(chooseButton())).toContain(message));
    expect(screen.queryByRole("img")).toBeNull();
    expect(requestClientLogoUpload).not.toHaveBeenCalled();
  });

  it("keeps the newer pick when an older measurement resolves after it", async () => {
    const user = setup();
    const older = deferred<{ width: number; height: number; close: () => void }>();
    vi.stubGlobal(
      "createImageBitmap",
      vi
        .fn()
        .mockImplementationOnce(() => older.promise)
        .mockImplementation(async () => ({ width: 800, height: 400, close: () => undefined })),
    );
    URL.createObjectURL = vi.fn((blob: Blob) => `blob:${(blob as File).name}`);
    renderStep(LEGACY);
    await user.upload(logoInput(), file("old.png", 2048, "image/png"));
    await user.upload(logoInput(), file("new.png", 2048, "image/png"));
    await waitFor(() => expect(screen.getByRole("img").getAttribute("src")).toBe("blob:new.png"));
    await act(async () => older.resolve({ width: 800, height: 400, close: () => undefined }));
    expect(screen.getByRole("img").getAttribute("src")).toBe("blob:new.png");
  });

  it("accepts the file when the browser can't measure it (the server re-checks)", async () => {
    const user = setup();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        throw new Error("decode");
      }),
    );
    renderStep(LEGACY);
    await user.upload(logoInput(), png());
    await waitFor(() => expect(screen.getByRole("img")).toBeTruthy());
  });

  it("ignores a pick while Avanti is pending", async () => {
    const user = setup();
    createClient.mockReturnValue(new Promise(() => undefined));
    renderStep();
    await fillAll(user);
    await user.click(next());
    const picks = vi.mocked(URL.createObjectURL).mock.calls.length;
    await user.upload(logoInput(), file("other.png", 2048, "image/png"));
    await act(async () => {});
    expect(vi.mocked(URL.createObjectURL).mock.calls.length).toBe(picks);
  });
});

const CLEAN_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" viewBox="0 0 10 10"><use href="#a"/><path id="a" d="M0 0h10v10z"/></svg>';
const svg = (text: string, name = "logo.svg") => new File([text], name, { type: "image/svg+xml" });

describe("ClientDetailsStep SVG logo", () => {
  it("previews a clean SVG without measuring pixels, then uploads and links it as image/svg+xml", async () => {
    const user = setup();
    const bitmap = vi.fn(async () => ({ width: 10, height: 10, close: () => undefined }));
    vi.stubGlobal("createImageBitmap", bitmap);
    renderStep();
    fireEvent.change(field("Nome"), { target: { value: "Lumen Srl" } });
    await user.click(pill("Lusso"));
    fireEvent.change(field("Descrizione"), { target: { value: "Brand." } });
    await user.upload(logoInput(), svg(CLEAN_SVG));
    await waitFor(() => expect(screen.getByRole("img").getAttribute("src")).toBe("blob:preview"));
    expect(bitmap).not.toHaveBeenCalled();
    fireEvent.change(field("Contesto"), { target: { value: "C" } });
    fireEvent.change(field("Soluzione"), { target: { value: "S" } });
    fireEvent.change(field("Risultati"), { target: { value: "R" } });
    await user.click(next());
    await waitFor(() => expect(push).toHaveBeenCalledWith(STEP_2));
    const size = new TextEncoder().encode(CLEAN_SVG).byteLength;
    expect(requestClientLogoUpload).toHaveBeenCalledExactlyOnceWith({ clientId: CLIENT_ID, contentType: "image/svg+xml", sizeBytes: size });
    expect(confirmClientLogoUpload).toHaveBeenCalledExactlyOnceWith({ clientId: CLIENT_ID, logoId: NEW_LOGO, contentType: "image/svg+xml" });
    expect(updateClient).toHaveBeenCalledWith(expect.objectContaining({ logoId: NEW_LOGO }));
  });

  it("accepts a .svg file the browser types as empty, by its extension", async () => {
    const user = setup();
    renderStep(LEGACY);
    await user.upload(logoInput(), new File([CLEAN_SVG], "logo.svg", { type: "" }));
    await waitFor(() => expect(screen.getByRole("img")).toBeTruthy());
  });

  it.each([
    ["a script", '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
    ["an event handler", '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'],
    ["an external link", '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.example/x.png"/></svg>'],
  ])("refuses an SVG with %s with the unsafe message, no preview and no presign", async (_label, text) => {
    const user = setup();
    renderStep(LEGACY);
    await user.upload(logoInput(), svg(text));
    await waitFor(() => expect(describedText(chooseButton())).toContain("Il file SVG non è sicuro: contiene script o collegamenti esterni."));
    expect(screen.queryByRole("img")).toBeNull();
    expect(requestClientLogoUpload).not.toHaveBeenCalled();
  });

  it.each([
    ["PNG bytes (not UTF-8)", () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "logo.svg", { type: "image/svg+xml" })],
    ["HTML", () => svg("<html><body>x</body></html>")],
    ["an SVG with no closing tag", () => svg('<svg xmlns="http://www.w3.org/2000/svg"><rect/>')],
  ])("refuses a .svg file holding %s with the unreadable message, not the unsafe one", async (_label, make) => {
    const user = setup();
    renderStep(LEGACY);
    await user.upload(logoInput(), make());
    await waitFor(() => expect(describedText(chooseButton())).toContain("Non è stato possibile leggere l'immagine. Scegli un altro file."));
    expect(describedText(chooseButton())).not.toContain("non è sicuro");
    expect(requestClientLogoUpload).not.toHaveBeenCalled();
  });

  it("keeps the newer pick when an older SVG scan finishes after it, with no error", async () => {
    const user = setup();
    const held = deferred<ArrayBuffer>();
    const older = svg('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', "old.svg");
    const bytes = await older.arrayBuffer();
    older.arrayBuffer = () => held.promise;
    URL.createObjectURL = vi.fn((blob: Blob) => `blob:${(blob as File).name}`);
    renderStep(LEGACY);
    await user.upload(logoInput(), older);
    await user.upload(logoInput(), svg(CLEAN_SVG, "new.svg"));
    await waitFor(() => expect(screen.getByRole("img").getAttribute("src")).toBe("blob:new.svg"));
    await act(async () => held.resolve(bytes));
    expect(screen.getByRole("img").getAttribute("src")).toBe("blob:new.svg");
    expect(describedText(chooseButton())).not.toContain("non è sicuro");
    expect(vi.mocked(URL.createObjectURL).mock.calls.map(([f]) => (f as File).name)).toEqual(["new.svg"]);
  });

  it.each([
    ["the unsafe message for reason unsafe_svg", { reason: "unsafe_svg" as const }, "Il file SVG non è sicuro: contiene script o collegamenti esterni."],
    ["the unreadable message for any other refusal", {}, "Non è stato possibile leggere l'immagine. Scegli un altro file."],
  ])("shows %s when confirm refuses an SVG", async (_label, extra, message) => {
    const user = setup();
    confirmClientLogoUpload.mockResolvedValue({ ok: false, status: 400, error: { code: "CLIENT_LOGO_INVALID", message: "m", ...extra } });
    renderStep(LEGACY);
    await user.upload(logoInput(), svg(CLEAN_SVG));
    await waitFor(() => expect(screen.getByRole("img")).toBeTruthy());
    fireEvent.change(field("Contesto"), { target: { value: "C" } });
    fireEvent.change(field("Soluzione"), { target: { value: "S" } });
    fireEvent.change(field("Risultati"), { target: { value: "R" } });
    await user.click(pill("Lusso"));
    await user.click(next());
    await waitFor(() => expect(describedText(chooseButton())).toContain(message));
    expect(push).not.toHaveBeenCalled();
  });

  it("still refuses a PNG under 400 px on the short side (raster rules unchanged)", async () => {
    const user = setup();
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1200, height: 399, close: () => undefined })));
    renderStep(LEGACY);
    await user.upload(logoInput(), png());
    await waitFor(() => expect(describedText(chooseButton())).toContain("Il logo deve misurare almeno 400 px sul lato corto."));
    expect(screen.queryByRole("img")).toBeNull();
  });
});

describe("ClientDetailsStep Avanti guard and logo failures", () => {
  it("sends one createClient when Avanti is pressed twice, busy and inactive while pending", async () => {
    const user = setup();
    createClient.mockReturnValue(new Promise(() => undefined));
    renderStep();
    await fillAll(user);
    await user.click(next());
    await user.click(next());
    expect(createClient).toHaveBeenCalledOnce();
    expect(next().getAttribute("aria-busy")).toBe("true");
    expect(next().getAttribute("aria-disabled")).toBe("true");
  });

  it("shows the unreadable message on the logo control when confirm refuses the image", async () => {
    const user = setup();
    confirmClientLogoUpload.mockResolvedValue({ ok: false, status: 400, error: { code: "CLIENT_LOGO_INVALID", message: "m" } });
    renderStep();
    await fillAll(user);
    await user.click(next());
    await waitFor(() => expect(describedText(chooseButton())).toContain("Non è stato possibile leggere l'immagine. Scegli un altro file."));
    expect(push).not.toHaveBeenCalled();
  });

  it("shows the generic alert when presign is refused with FORBIDDEN", async () => {
    const user = setup();
    requestClientLogoUpload.mockResolvedValue({ ok: false, status: 403, error: { code: "FORBIDDEN", message: "m" } });
    renderStep();
    await fillAll(user);
    await user.click(next());
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Non è stato possibile salvare. Riprova."));
    expect(push).not.toHaveBeenCalled();
  });

  it("shows CLIENT_LOGO_INVALID from the link on the logo control", async () => {
    const user = setup();
    updateClient.mockResolvedValue({ ok: false, status: 400, error: { code: "CLIENT_LOGO_INVALID", message: "m" } });
    renderStep();
    await fillAll(user);
    await user.click(next());
    await waitFor(() => expect(describedText(chooseButton())).toContain("Non è stato possibile leggere l'immagine. Scegli un altro file."));
    expect(push).not.toHaveBeenCalled();
  });
});

describe("ClientDetailsStep autosave gate and links", () => {
  it("on a new client, saves no text on blur and shows no save error", async () => {
    renderStep();
    fireEvent.change(field("Contesto"), { target: { value: "Testo." } });
    fireEvent.blur(field("Contesto"));
    await act(async () => {});
    expect(saveClientBriefField).not.toHaveBeenCalled();
    expect(field("Contesto").hasAttribute("aria-invalid")).toBe(false);
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("on a new client, leaves a same-origin link alone", async () => {
    render(
      <>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a plain same-origin link, as the frame renders */}
        <a href="/clients">Indietro</a>
        <ClientDetailsStep client={null} industries={INDUSTRIES} limits={LIMITS} />
      </>,
    );
    fireEvent.change(field("Nome"), { target: { value: "Lumen" } });
    fireEvent.change(field("Contesto"), { target: { value: "Testo." } });
    let ownHandlerRan = false;
    const link = screen.getByRole("link", { name: "Indietro" });
    link.addEventListener("click", (event) => {
      ownHandlerRan = true;
      event.preventDefault();
    });
    click(link);
    expect(ownHandlerRan).toBe(true);
    await act(async () => {});
    expect(push).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("on an existing client, a link with an unsaved name saves it as Avanti does, then follows the link", async () => {
    render(
      <>
        <a href={`/clients/${CLIENT_ID}`}>Indietro</a>
        <ClientDetailsStep client={EXISTING} industries={INDUSTRIES} limits={LIMITS} />
      </>,
    );
    fireEvent.change(field("Nome"), { target: { value: "Lumen S.r.l." } });
    const event = click(screen.getByRole("link", { name: "Indietro" }));
    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => expect(push).toHaveBeenCalledExactlyOnceWith(`/clients/${CLIENT_ID}`));
    expect(updateClient).toHaveBeenCalledExactlyOnceWith({
      clientId: CLIENT_ID,
      name: "Lumen S.r.l.",
      industries: ["energia", "lusso"],
      description: "Brand.",
      logoId: OLD_LOGO,
    });
  });

  it("on an existing client, a link with a new logo uploads and links it first; a refusal keeps the step with the error", async () => {
    const user = setup();
    updateClient.mockResolvedValueOnce({ ok: false, status: 409, error: { code: "CLIENT_NAME_TAKEN", message: "m" } });
    render(
      <>
        <a href={`/clients/${CLIENT_ID}`}>Indietro</a>
        <ClientDetailsStep client={EXISTING} industries={INDUSTRIES} limits={LIMITS} />
      </>,
    );
    await user.upload(logoInput(), png());
    await waitFor(() => expect(screen.getByRole("img").getAttribute("src")).toBe("blob:preview"));
    expect(click(screen.getByRole("link", { name: "Indietro" })).defaultPrevented).toBe(true);
    await waitFor(() => expect(describedText(field("Nome"))).toBe("Esiste già un cliente con questo nome."));
    expect(requestClientLogoUpload).toHaveBeenCalledOnce();
    expect(push).not.toHaveBeenCalled();
  });
});
