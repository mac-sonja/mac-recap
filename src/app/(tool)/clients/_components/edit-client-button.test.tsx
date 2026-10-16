// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResult } from "@/app/_lib/action-result";
import type { Client, ClientDetail } from "@/modules/case-study";

const refresh = vi.fn();
const updateClient = vi.fn<(input: unknown) => Promise<ActionResult<Client>>>();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/(tool)/clients/actions", () => ({
  createClient: vi.fn(),
  updateClient: (input: unknown) => updateClient(input),
  requestClientLogoUpload: vi.fn(),
  confirmClientLogoUpload: vi.fn(),
}));

const { EditClientButton } = await import("./edit-client-button");

const LIMITS = {
  nameMax: 120,
  sectorMax: 60,
  descriptionMax: 400,
  logoTypes: ["image/png", "image/jpeg", "image/webp"],
  logoMaxBytes: 5 * 1024 * 1024,
  logoMinShortSide: 400,
};
const LUMEN: ClientDetail = {
  id: "cccccccc-0000-4000-8000-000000000001",
  name: "Lumen Srl",
  code: "LUM",
  sector: null,
  description: null,
  logoId: null,
  logoUrl: null,
};
const LUMEN_SAVED: Client = { id: LUMEN.id, name: LUMEN.name, code: LUMEN.code, sector: null, description: null, logoId: null };
const open = () => screen.getByRole("button", { name: "Modifica cliente" });
const field = () => screen.getByLabelText("Nome del cliente") as HTMLInputElement;

beforeEach(() => {
  refresh.mockReset();
  updateClient.mockReset();
});
afterEach(cleanup);

describe("EditClientButton", () => {
  it("is hidden below 1024 px", () => {
    render(<EditClientButton client={LUMEN} limits={LIMITS} />);
    expect(open().className).toContain("hidden");
    expect(open().className).toContain("lg:inline-flex");
  });

  it("states the code stays and approved case histories keep their data, prefills, saves, refreshes and returns focus", async () => {
    const user = userEvent.setup();
    render(<EditClientButton client={LUMEN} limits={LIMITS} />);
    await user.click(open());
    const dialog = screen.getByRole("dialog", { name: "Modifica cliente" });
    expect(dialog.getAttribute("aria-describedby")).not.toBeNull();
    expect(document.getElementById(dialog.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "Il codice LUM non cambia. Le case history già approvate mantengono i dati con cui sono state generate.",
    );
    expect(field().value).toBe("Lumen Srl");
    updateClient.mockResolvedValue({ ok: true, value: { ...LUMEN_SAVED, name: "Lumen S.r.l." } });
    await user.clear(field());
    await user.type(field(), "Lumen S.r.l.");
    await user.click(screen.getByRole("button", { name: "Salva" }));
    expect(updateClient).toHaveBeenCalledExactlyOnceWith({
      clientId: LUMEN.id,
      name: "Lumen S.r.l.",
      sector: null,
      description: null,
      logoId: null,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(refresh).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(open());
  });

  it("saves its own name as typed", async () => {
    const user = userEvent.setup();
    render(<EditClientButton client={LUMEN} limits={LIMITS} />);
    await user.click(open());
    updateClient.mockResolvedValue({ ok: true, value: { ...LUMEN_SAVED, name: "lumen srl" } });
    await user.clear(field());
    await user.type(field(), "lumen srl");
    await user.click(screen.getByRole("button", { name: "Salva" }));
    expect(updateClient).toHaveBeenCalledWith(expect.objectContaining({ clientId: LUMEN.id, name: "lumen srl" }));
  });

  it("shows CLIENT_NAME_TAKEN under the field and stays open", async () => {
    const user = userEvent.setup();
    render(<EditClientButton client={LUMEN} limits={LIMITS} />);
    await user.click(open());
    updateClient.mockResolvedValue({ ok: false, status: 409, error: { code: "CLIENT_NAME_TAKEN", message: "m" } });
    await user.clear(field());
    await user.type(field(), "Acme");
    await user.click(screen.getByRole("button", { name: "Salva" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(document.getElementById(field().getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "Esiste già un cliente con questo nome.",
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows the generic dialog error on CLIENT_NOT_FOUND", async () => {
    const user = userEvent.setup();
    render(<EditClientButton client={LUMEN} limits={LIMITS} />);
    await user.click(open());
    updateClient.mockResolvedValue({ ok: false, status: 404, error: { code: "CLIENT_NOT_FOUND", message: "m" } });
    await user.click(screen.getByRole("button", { name: "Salva" }));
    expect(screen.getByRole("alert").textContent).toBe("Non è stato possibile salvare. Riprova.");
    expect(field().hasAttribute("aria-invalid")).toBe(false);
  });
});
