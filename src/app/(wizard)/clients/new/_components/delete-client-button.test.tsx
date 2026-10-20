// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResult } from "@/app/_lib/action-result";
import type { ClientDeleted } from "@/modules/case-study";
import { it as dict, fill } from "@/shared/i18n/it";

const push = vi.fn();
const refresh = vi.fn();
const deleteClient = vi.fn<(input: unknown) => Promise<ActionResult<ClientDeleted>>>();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/app/(tool)/clients/actions", () => ({ deleteClient: (input: unknown) => deleteClient(input) }));

const { DeleteClientButton } = await import("./delete-client-button");

const CLIENT_ID = "cccccccc-0000-4000-8000-000000000001";
const NAME = "Lumen S.r.l.";

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  deleteClient.mockReset();
  deleteClient.mockResolvedValue({ ok: true, value: { deletedCases: 2 } });
});
afterEach(cleanup);

const open = async (caseCount = 2) => {
  const user = userEvent.setup();
  render(<DeleteClientButton clientId={CLIENT_ID} name={NAME} caseCount={caseCount} />);
  await user.click(screen.getByRole("button", { name: "Elimina cliente" }));
  const dialog = await screen.findByRole("dialog", { name: `Eliminare ${NAME}?` });
  return { user, dialog, input: screen.getByLabelText("Per conferma, scrivi il nome del cliente"), confirm: screen.getByRole("button", { name: "Elimina" }) };
};

describe("DeleteClientButton", () => {
  it("opens a dialog naming the client and its case histories, approved ones included", async () => {
    const { dialog } = await open(2);
    expect(dialog.hasAttribute("aria-describedby")).toBe(true);
    expect(dialog.textContent).toContain(
      fill(dict.clientWizard.delete.withCases, { n: 2 }),
    );
    expect(screen.getByRole("button", { name: "Annulla" })).toBeTruthy();
  });

  it("says the client has no case histories when the count is 0", async () => {
    const { dialog } = await open(0);
    expect(dialog.textContent).toContain(dict.clientWizard.delete.noCases);
    expect(dialog.textContent).not.toContain("Con lui spariscono");
  });

  it("keeps Elimina inactive until the typed name matches, and never calls the action before", async () => {
    const { user, input, confirm } = await open();
    expect(confirm.getAttribute("aria-disabled")).toBe("true");
    await user.type(input, "Lumen");
    expect(confirm.getAttribute("aria-disabled")).toBe("true");
    await user.click(confirm);
    await user.type(input, "{Enter}");
    expect(deleteClient).not.toHaveBeenCalled();
    await user.clear(input);
    await user.type(input, "lumen s.r.l.");
    expect(confirm.getAttribute("aria-disabled")).toBe("true");
  });

  it("links the reason to Elimina while it is inactive, and drops it once the name matches", async () => {
    const { user, input, confirm } = await open();
    const reasonId = confirm.getAttribute("aria-describedby");
    expect(reasonId).toBeTruthy();
    expect(document.getElementById(reasonId!)?.textContent).toBe("Scrivi il nome del cliente per attivare Elimina.");
    await user.type(input, NAME);
    expect(confirm.hasAttribute("aria-describedby")).toBe(false);
    expect(screen.queryByText("Scrivi il nome del cliente per attivare Elimina.")).toBeNull();
  });

  it("does not count a no-break space as a space", async () => {
    const { user, input, confirm } = await open();
    await user.type(input, "Lumen\u00a0S.r.l.");
    expect(confirm.getAttribute("aria-disabled")).toBe("true");
    await user.click(confirm);
    expect(deleteClient).not.toHaveBeenCalled();
  });

  it("accepts the name with extra spaces, deletes, and goes to /clients", async () => {
    const { user, input, confirm } = await open();
    await user.type(input, "  Lumen   S.r.l. ");
    expect(confirm.hasAttribute("aria-disabled")).toBe(false);
    await user.click(confirm);
    expect(deleteClient).toHaveBeenCalledExactlyOnceWith({ clientId: CLIENT_ID, confirmName: "  Lumen   S.r.l. " });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/clients"));
  });

  it("goes to /clients when the client is already deleted", async () => {
    deleteClient.mockResolvedValue({ ok: false, status: 404, error: { code: "CLIENT_NOT_FOUND", message: "m" } });
    const { user, input, confirm } = await open();
    await user.type(input, NAME);
    await user.click(confirm);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/clients"));
  });

  it("stays open with an error when the delete fails", async () => {
    deleteClient.mockResolvedValue({ ok: false, status: 500, error: { code: "CLIENT_WRITE_FAILED", message: "m" } });
    const { user, input, confirm } = await open();
    await user.type(input, NAME);
    await user.click(confirm);
    expect(await screen.findByText("Non siamo riusciti a eliminare il cliente. Riprova.")).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  it("says the name changed and refreshes the page on CLIENT_DELETE_NAME_MISMATCH", async () => {
    deleteClient.mockResolvedValue({ ok: false, status: 400, error: { code: "CLIENT_DELETE_NAME_MISMATCH", message: "m" } });
    const { user, input, confirm } = await open();
    await user.type(input, NAME);
    await user.click(confirm);
    expect(await screen.findByText("Nel frattempo il nome del cliente è cambiato. Ricarica la pagina e riprova.")).toBeTruthy();
    expect(refresh).toHaveBeenCalledOnce();
    expect(push).not.toHaveBeenCalled();
    expect(confirm.hasAttribute("aria-disabled")).toBe(false);
  });

  it("shows the retry message and is usable again when the call throws", async () => {
    deleteClient.mockRejectedValueOnce(new Error("network"));
    const { user, input, confirm } = await open();
    await user.type(input, NAME);
    await user.click(confirm);
    expect(await screen.findByText("Non siamo riusciti a eliminare il cliente. Riprova.")).toBeTruthy();
    expect(confirm.hasAttribute("aria-disabled")).toBe(false);
    await user.click(confirm);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/clients"));
    expect(deleteClient).toHaveBeenCalledTimes(2);
  });

  it("closes on Annulla without deleting", async () => {
    const { user, dialog } = await open();
    await user.click(screen.getByRole("button", { name: "Annulla" }));
    await waitFor(() => expect((dialog as HTMLDialogElement).open).toBe(false));
    expect(deleteClient).not.toHaveBeenCalled();
  });
});
