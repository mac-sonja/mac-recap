// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResult } from "@/app/_lib/action-result";
import type { Client } from "@/modules/case-study";

const refresh = vi.fn();
const renameClient = vi.fn<(input: unknown) => Promise<ActionResult<Client>>>();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/(tool)/clients/actions", () => ({ createClient: vi.fn(), renameClient: (input: unknown) => renameClient(input) }));

const { RenameClientButton } = await import("./rename-client-button");

const LUMEN: Client = { id: "cccccccc-0000-4000-8000-000000000001", name: "Lumen Srl", code: "LUM" };
const open = () => screen.getByRole("button", { name: "Modifica nome" });
const field = () => screen.getByLabelText("Nome del cliente") as HTMLInputElement;

beforeEach(() => {
  refresh.mockReset();
  renameClient.mockReset();
});
afterEach(cleanup);

describe("RenameClientButton", () => {
  it("is hidden below 1024 px", () => {
    render(<RenameClientButton client={LUMEN} nameMaxLength={120} />);
    expect(open().className).toContain("hidden");
    expect(open().className).toContain("lg:inline-flex");
  });

  it("states the code stays, prefills the name, renames, refreshes and returns focus", async () => {
    const user = userEvent.setup();
    render(<RenameClientButton client={LUMEN} nameMaxLength={120} />);
    await user.click(open());
    const dialog = screen.getByRole("dialog", { name: "Modifica nome" });
    expect(dialog.getAttribute("aria-describedby")).not.toBeNull();
    expect(document.getElementById(dialog.getAttribute("aria-describedby") ?? "")?.textContent).toBe("Il codice LUM non cambia.");
    expect(field().value).toBe("Lumen Srl");
    renameClient.mockResolvedValue({ ok: true, value: { ...LUMEN, name: "Lumen S.r.l." } });
    await user.clear(field());
    await user.type(field(), "Lumen S.r.l.");
    await user.click(screen.getByRole("button", { name: "Salva" }));
    expect(renameClient).toHaveBeenCalledExactlyOnceWith({ clientId: LUMEN.id, name: "Lumen S.r.l." });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(refresh).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(open());
  });

  it("saves its own name as typed", async () => {
    const user = userEvent.setup();
    render(<RenameClientButton client={LUMEN} nameMaxLength={120} />);
    await user.click(open());
    renameClient.mockResolvedValue({ ok: true, value: { ...LUMEN, name: "lumen srl" } });
    await user.clear(field());
    await user.type(field(), "lumen srl");
    await user.click(screen.getByRole("button", { name: "Salva" }));
    expect(renameClient).toHaveBeenCalledWith({ clientId: LUMEN.id, name: "lumen srl" });
  });

  it("shows CLIENT_NAME_TAKEN under the field and stays open", async () => {
    const user = userEvent.setup();
    render(<RenameClientButton client={LUMEN} nameMaxLength={120} />);
    await user.click(open());
    renameClient.mockResolvedValue({ ok: false, status: 409, error: { code: "CLIENT_NAME_TAKEN", message: "m" } });
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
    render(<RenameClientButton client={LUMEN} nameMaxLength={120} />);
    await user.click(open());
    renameClient.mockResolvedValue({ ok: false, status: 404, error: { code: "CLIENT_NOT_FOUND", message: "m" } });
    await user.click(screen.getByRole("button", { name: "Salva" }));
    expect(screen.getByRole("alert").textContent).toBe("Non è stato possibile salvare. Riprova.");
    expect(field().hasAttribute("aria-invalid")).toBe(false);
  });
});
