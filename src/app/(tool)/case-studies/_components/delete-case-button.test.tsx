// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResult } from "@/app/_lib/action-result";
import { it as dict, fill } from "@/shared/i18n/it";

const refresh = vi.fn();
const deleteCaseStudy = vi.fn<(input: unknown) => Promise<ActionResult<void>>>();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/(tool)/case-studies/actions", () => ({ deleteCaseStudy: (input: unknown) => deleteCaseStudy(input) }));

const { DeleteCaseButton } = await import("./delete-case-button");

const CASE_ID = "bbbbbbbb-0000-4000-8000-000000000002";
const NAME = "Rebrand";
const copy = dict.caseStudies.delete;

beforeEach(() => {
  refresh.mockReset();
  deleteCaseStudy.mockReset();
  deleteCaseStudy.mockResolvedValue({ ok: true, value: undefined });
});
afterEach(cleanup);

const open = async () => {
  const user = userEvent.setup();
  render(<DeleteCaseButton caseId={CASE_ID} name={NAME} />);
  await user.click(screen.getByRole("button", { name: fill(copy.button, { name: NAME }) }));
  const dialog = await screen.findByRole("dialog", { name: fill(copy.title, { name: NAME }) });
  return { user, dialog, confirm: screen.getByRole("button", { name: copy.confirm }) };
};

describe("DeleteCaseButton", () => {
  it("opens a dialog naming the draft and saying it can't be undone; Annulla closes it without deleting", async () => {
    const { user, dialog } = await open();
    expect(dialog.textContent).toContain(copy.description);
    await user.click(screen.getByRole("button", { name: copy.cancel }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(deleteCaseStudy).not.toHaveBeenCalled();
  });

  it("deletes the case on Elimina, closes the dialog and reloads the list", async () => {
    const { user, confirm } = await open();
    await user.click(confirm);
    expect(deleteCaseStudy).toHaveBeenCalledExactlyOnceWith({ caseId: CASE_ID });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("treats a case already gone (NOT_FOUND) as deleted", async () => {
    deleteCaseStudy.mockResolvedValue({ ok: false, status: 404, error: { code: "NOT_FOUND", message: "m" } });
    const { user, confirm } = await open();
    await user.click(confirm);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("says so and reloads the list when the case is no longer a draft", async () => {
    deleteCaseStudy.mockResolvedValue({ ok: false, status: 409, error: { code: "CASE_NOT_DELETABLE", message: "m" } });
    const { user, confirm } = await open();
    await user.click(confirm);
    expect((await screen.findByRole("alert")).textContent).toBe(copy.notDraft);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it.each([
    ["a failed write", () => deleteCaseStudy.mockResolvedValue({ ok: false, status: 500, error: { code: "CASE_STUDY_WRITE_FAILED", message: "m" } })],
    ["a thrown call", () => deleteCaseStudy.mockRejectedValue(new Error("network"))],
  ])("shows a retry message for %s and keeps the dialog open", async (_label, arrange) => {
    arrange();
    const { user, confirm } = await open();
    await user.click(confirm);
    expect((await screen.findByRole("alert")).textContent).toBe(copy.failed);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });
});
