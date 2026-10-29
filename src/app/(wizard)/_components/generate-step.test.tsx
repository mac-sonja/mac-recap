// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResult } from "@/app/_lib/action-result";
import { it as dict, fill } from "@/shared/i18n/it";

const refresh = vi.fn();
const generateCaseStudy = vi.fn<(input: unknown) => Promise<ActionResult<{ jobId: string }>>>();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock("@/app/(tool)/case-studies/actions", () => ({ generateCaseStudy: (input: unknown) => generateCaseStudy(input) }));

const { GenerateStep } = await import("./generate-step");

const CASE_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const copy = dict.wizard.generate;
const fail = (code: string): ActionResult<never> => ({ ok: false, status: 409, error: { code, message: "m" } });

beforeEach(() => {
  refresh.mockReset();
  generateCaseStudy.mockReset();
});
afterEach(cleanup);

const button = (name: string) => screen.getByRole("button", { name });

describe("GenerateStep", () => {
  it("shows the counter and an enabled Genera with material", () => {
    render(<GenerateStep caseId={CASE_ID} fileCount={3} filled={1} total={2} failed={false} />);
    expect(screen.getByText(fill(copy.counter, { n: 3, m: 1, total: 2 }))).toBeTruthy();
    expect(button(copy.action).getAttribute("aria-disabled")).toBe("false");
    expect(button(copy.action).getAttribute("aria-describedby")).toBeNull();
    expect(screen.queryByText(copy.failed)).toBeNull();
  });

  it("disables Genera without a file, links its reason, and never calls the action", async () => {
    const user = userEvent.setup();
    render(<GenerateStep caseId={CASE_ID} fileCount={0} filled={2} total={2} failed={false} />);
    const genera = button(copy.action);
    expect(genera.getAttribute("aria-disabled")).toBe("true");
    const reason = document.getElementById(genera.getAttribute("aria-describedby") ?? "");
    expect(reason?.textContent).toBe(copy.noMaterial);
    await user.click(genera);
    expect(generateCaseStudy).not.toHaveBeenCalled();
  });

  it("runs the action once, shows the busy state and asks the page again", async () => {
    const user = userEvent.setup();
    let release: (value: ActionResult<{ jobId: string }>) => void = () => {};
    generateCaseStudy.mockReturnValue(new Promise((resolve) => (release = resolve)));
    render(<GenerateStep caseId={CASE_ID} fileCount={1} filled={0} total={2} failed={false} />);
    await user.click(button(copy.action));
    await user.click(button(copy.action));
    expect(generateCaseStudy).toHaveBeenCalledExactlyOnceWith({ caseId: CASE_ID });
    expect(button(copy.action).getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("status").textContent).toBe(copy.starting);
    release({ ok: true, value: { jobId: "j" } });
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  });

  it("keeps the starting announcement outside any aria-busy container, so it is read out", async () => {
    const user = userEvent.setup();
    generateCaseStudy.mockReturnValue(new Promise(() => {}));
    const { container } = render(<GenerateStep caseId={CASE_ID} fileCount={1} filled={0} total={2} failed={false} />);
    await user.click(button(copy.action));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(copy.starting));
    expect(container.querySelector("[aria-busy] [role=status]")).toBeNull();
  });

  it.each([
    ["NO_MATERIAL", copy.noMaterial],
    ["STALE_STATUS", dict.wizard.errors.notDraft],
    ["NOT_FOUND", dict.wizard.errors.notDraft],
    ["CASE_STUDY_WRITE_FAILED", copy.errors.generic],
  ])("shows %s in the alert line and stays on the step", async (code, message) => {
    const user = userEvent.setup();
    generateCaseStudy.mockResolvedValue(fail(code));
    render(<GenerateStep caseId={CASE_ID} fileCount={1} filled={0} total={2} failed={false} />);
    await user.click(button(copy.action));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(message));
    expect(refresh).not.toHaveBeenCalled();
    expect(button(copy.action).getAttribute("aria-busy")).toBeNull();
  });

  it("shows the generic message when the action throws, and lets the person retry", async () => {
    const user = userEvent.setup();
    generateCaseStudy.mockRejectedValueOnce(new Error("down"));
    render(<GenerateStep caseId={CASE_ID} fileCount={1} filled={0} total={2} failed={false} />);
    await user.click(button(copy.action));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(copy.errors.generic));
    generateCaseStudy.mockResolvedValue({ ok: true, value: { jobId: "j" } });
    await user.click(button(copy.action));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(screen.getByRole("alert").textContent).toBe("");
  });

  it("after a failed run shows the failure and Riprova, which runs the same action", async () => {
    const user = userEvent.setup();
    generateCaseStudy.mockResolvedValue({ ok: true, value: { jobId: "j" } });
    render(<GenerateStep caseId={CASE_ID} fileCount={2} filled={2} total={2} failed />);
    expect(screen.getByText(copy.failed)).toBeTruthy();
    expect(screen.queryByRole("button", { name: copy.action })).toBeNull();
    await user.click(button(copy.retry));
    expect(generateCaseStudy).toHaveBeenCalledExactlyOnceWith({ caseId: CASE_ID });
  });
});
