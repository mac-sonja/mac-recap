// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fill, it as dict } from "@/shared/i18n/it";

const { requestClientExport, getClientExportStatus } = vi.hoisted(() => ({ requestClientExport: vi.fn(), getClientExportStatus: vi.fn() }));
vi.mock("@/app/(tool)/clients/export-actions", () => ({ requestClientExport, getClientExportStatus }));

const { ClientPackButton } = await import("./client-pack-button");

const CLIENT_ID = "cccccccc-0000-4000-8000-000000000001";
const LABEL = fill(dict.download.packLabel, { name: "Lumen Srl" });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const open = () => fireEvent.click(screen.getByRole("button", { name: LABEL, hidden: true }));
const dialog = () => document.querySelector("dialog")!;
const confirm = () => screen.getAllByRole("button", { name: dict.download.action, hidden: true }).find((b) => b.closest("dialog") !== null)!;

describe("ClientPackButton (Story 5.9a)", () => {
  it("is not offered without an approved case", () => {
    render(<ClientPackButton clientId={CLIENT_ID} name="Lumen Srl" approvedCount={0} introApproved />);
    expect(screen.queryByRole("button", { name: LABEL, hidden: true })).toBeNull();
  });

  it("opens the case's export dialog for the pack, with no note when the intro is approved", () => {
    render(<ClientPackButton clientId={CLIENT_ID} name="Lumen Srl" approvedCount={3} introApproved />);
    open();
    expect(dialog().textContent).toContain(fill(dict.download.packTitle, { name: "Lumen Srl" }));
    expect(dialog().textContent).toContain(fill(dict.download.packDescription, { n: 3 }));
    expect(dialog().textContent).not.toContain(dict.download.packIntroNote);
  });

  it("says each case keeps its own intro and closing when the client's intro isn't approved", () => {
    render(<ClientPackButton clientId={CLIENT_ID} name="Lumen Srl" approvedCount={2} introApproved={false} />);
    open();
    expect(dialog().textContent).toContain(dict.download.packIntroNote);
    // The note describes the formats, so screen readers hear it.
    const described = dialog().querySelector("fieldset")!.getAttribute("aria-describedby") ?? "";
    expect(described.split(" ").map((id) => document.getElementById(id)?.textContent)).toContain(dict.download.packIntroNote);
    expect(dialog().textContent).toContain(fill(dict.download.packDescriptionNoIntro, { n: 2 }));
  });

  it("asks for the client's pack in the ticked format", async () => {
    requestClientExport.mockResolvedValue({ ok: false, status: 409, error: { code: "NOT_APPROVED", message: "x" } });
    render(<ClientPackButton clientId={CLIENT_ID} name="Lumen Srl" approvedCount={1} introApproved />);
    open();
    fireEvent.click(confirm());
    await screen.findByText(dict.download.packNotApproved);
    expect(requestClientExport).toHaveBeenCalledExactlyOnceWith({ clientId: CLIENT_ID, formats: ["presentazione_16_9"] });
  });
});
