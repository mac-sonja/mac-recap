// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fill, it as dict } from "@/shared/i18n/it";
import { DOWNLOAD_GIVE_UP_MS, DOWNLOAD_POLL_MS, DownloadButton, type DownloadPoll, type DownloadStart } from "./download-button";

const LABEL = fill(dict.download.caseLabel, { name: "Rebrand Lumen" });
const TITLE = fill(dict.download.caseTitle, { name: "Rebrand Lumen" });
const FILE = { url: "https://storage.test/signed?download=x", fileName: "LUM-2026-01 Rebrand Lumen – Presentazione.pdf" };

const FAILED = fill(dict.download.failedCase, { name: "Rebrand Lumen" });

let clicked: { href: string; download: string }[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  clicked = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push({ href: this.href, download: this.download });
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function setup(onDownload?: (format: string) => Promise<DownloadStart>, onPoll?: (ticket: string) => Promise<DownloadPoll>) {
  return render(
    <DownloadButton
      label={LABEL}
      title={TITLE}
      description={dict.download.caseDescription}
      onDownload={onDownload}
      onPoll={onPoll}
      failedMessage={FAILED}
    />,
  );
}

const trigger = () => screen.getByRole("button", { name: LABEL, hidden: true });
const dialog = () => document.querySelector("dialog")!;
/** The dialog's Scarica (the trigger is labelled with the case name). */
const confirm = () => screen.getAllByRole("button", { name: dict.download.action, hidden: true }).find((b) => b.closest("dialog") !== null)!;

async function choose(format?: string) {
  fireEvent.click(trigger());
  if (format !== undefined) fireEvent.click(screen.getByRole("radio", { name: new RegExp(format), hidden: true }));
  await act(async () => {
    fireEvent.click(confirm());
  });
}

describe("DownloadButton (Story 5.3)", () => {
  it("keeps the picker's look: Presentazione chosen, then Carosello, Video under In arrivo; Scarica is inactive without a handler", () => {
    setup();
    fireEvent.click(trigger());
    const radios = screen.getAllByRole("radio", { hidden: true }) as HTMLInputElement[];
    expect(radios.filter((r) => !r.disabled).map((r) => r.value)).toEqual(["presentazione_16_9", "carosello_1_1"]);
    expect(radios[0].checked).toBe(true);
    expect(dialog().textContent).toContain(dict.download.upcoming.video);
    expect(confirm().getAttribute("aria-disabled")).toBe("true");
  });

  it("asks for the chosen format, closes the dialog and shows progress, polls every 2 s, then downloads the file", async () => {
    const onDownload = vi.fn(async (): Promise<DownloadStart> => ({ kind: "pending", ticket: "job-1" }));
    const answers: DownloadPoll[] = [{ kind: "pending" }, { kind: "ready", ...FILE }];
    const onPoll = vi.fn(async () => answers.shift()!);
    setup(onDownload, onPoll);
    await choose(dict.download.format.carosello_1_1.name);

    expect(onDownload).toHaveBeenCalledExactlyOnceWith("carosello_1_1");
    expect(dialog().open).toBe(false);
    expect(trigger().textContent).toContain(dict.download.working);
    expect(trigger().getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("status", { hidden: true }).textContent).toBe(dict.download.working);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DOWNLOAD_POLL_MS - 1);
    });
    expect(onPoll).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(onPoll).toHaveBeenCalledExactlyOnceWith("job-1");
    expect(clicked).toEqual([]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DOWNLOAD_POLL_MS);
    });
    expect(onPoll).toHaveBeenCalledTimes(2);
    expect(clicked).toEqual([{ href: FILE.url, download: FILE.fileName }]);
    expect(trigger().textContent).toContain(dict.download.action);
    expect(trigger().getAttribute("aria-busy")).toBeNull();
    expect(screen.getByRole("status", { hidden: true }).textContent).toBe(dict.download.ready);
  });

  it("downloads at once a file already made, without polling", async () => {
    const onPoll = vi.fn();
    setup(async () => ({ kind: "ready", ...FILE }), onPoll);
    await choose();
    expect(clicked).toEqual([{ href: FILE.url, download: FILE.fileName }]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DOWNLOAD_POLL_MS * 3);
    });
    expect(onPoll).not.toHaveBeenCalled();
  });

  it("shows a refusal in the dialog and keeps it open", async () => {
    const onPoll = vi.fn();
    setup(async () => ({ kind: "refused", message: dict.download.notApproved }), onPoll);
    await choose();
    expect(dialog().open).toBe(true);
    expect(screen.getByRole("alert", { hidden: true }).textContent).toBe(dict.download.notApproved);
    expect(trigger().getAttribute("aria-busy")).toBeNull();
    // Choosing another format clears it.
    fireEvent.click(screen.getByRole("radio", { name: new RegExp(dict.download.format.carosello_1_1.name), hidden: true }));
    expect(screen.queryByRole("alert", { hidden: true })).toBeNull();
    expect(onPoll).not.toHaveBeenCalled();
    expect(clicked).toEqual([]);
  });

  it("shows the failure toast with Riprova when the export didn't finish; Riprova asks again for the same format", async () => {
    const onDownload = vi.fn(async (): Promise<DownloadStart> => ({ kind: "pending", ticket: "job-1" }));
    setup(onDownload, async () => ({ kind: "failed" }));
    await choose(dict.download.format.carosello_1_1.name);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DOWNLOAD_POLL_MS);
    });
    const toast = screen.getByRole("alert", { hidden: true });
    expect(toast.textContent).toContain(FAILED);
    expect(FAILED).toContain("Rebrand Lumen");
    expect(trigger().textContent).toContain(dict.download.action);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: dict.download.retry, hidden: true }));
    });
    expect(onDownload).toHaveBeenCalledTimes(2);
    expect(onDownload).toHaveBeenLastCalledWith("carosello_1_1");
    expect(screen.queryByText(FAILED)).toBeNull();
    expect(trigger().textContent).toContain(dict.download.working);
  });

  it("closes the toast without asking again", async () => {
    const onDownload = vi.fn(async (): Promise<DownloadStart> => ({ kind: "pending", ticket: "job-1" }));
    setup(onDownload, async () => {
      throw new Error("offline");
    });
    await choose();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DOWNLOAD_POLL_MS);
    });
    const toast = screen.getByRole("alert", { hidden: true });
    fireEvent.click(toast.querySelector<HTMLButtonElement>(`button[aria-label="${dict.download.close}"]`)!);
    expect(screen.queryByRole("alert", { hidden: true })).toBeNull();
    expect(onDownload).toHaveBeenCalledOnce();
  });

  it("shows the spinner while the request starts, and sends one request for a double click", async () => {
    let answer: (start: DownloadStart) => void = () => undefined;
    const onDownload = vi.fn(() => new Promise<DownloadStart>((resolve) => (answer = resolve)));
    setup(onDownload, async () => ({ kind: "pending" }));
    fireEvent.click(trigger());
    const scarica = confirm();
    fireEvent.click(scarica);
    fireEvent.click(scarica);
    expect(onDownload).toHaveBeenCalledOnce();
    expect(trigger().textContent).toContain(dict.download.working);
    expect(trigger().getAttribute("aria-busy")).toBe("true");
    await act(async () => answer({ kind: "pending", ticket: "job-1" }));
    expect(trigger().textContent).toContain(dict.download.working);
  });

  it("gives up after 5 minutes of pending: the failure toast with Riprova", async () => {
    const onPoll = vi.fn(async (): Promise<DownloadPoll> => ({ kind: "pending" }));
    setup(async () => ({ kind: "pending", ticket: "job-1" }), onPoll);
    await choose();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DOWNLOAD_GIVE_UP_MS - DOWNLOAD_POLL_MS);
    });
    expect(screen.queryByRole("alert", { hidden: true })).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DOWNLOAD_POLL_MS * 2);
    });
    expect(screen.getByRole("alert", { hidden: true }).textContent).toContain(FAILED);
    expect(screen.getByRole("button", { name: dict.download.retry, hidden: true })).toBeTruthy();
    const polls = onPoll.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DOWNLOAD_POLL_MS * 5);
    });
    expect(onPoll.mock.calls.length).toBe(polls);
    expect(clicked).toEqual([]);
  });

  it("ignores the trigger while the file is being made", async () => {
    setup(async () => ({ kind: "pending", ticket: "job-1" }), async () => ({ kind: "pending" }));
    await choose();
    fireEvent.click(trigger());
    expect(dialog().open).toBe(false);
  });

  it("stops waiting when the page that asked is gone: no download", async () => {
    const onPoll = vi.fn(async (): Promise<DownloadPoll> => ({ kind: "ready", ...FILE }));
    const { unmount } = setup(async () => ({ kind: "pending", ticket: "job-1" }), onPoll);
    await choose();
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DOWNLOAD_POLL_MS * 3);
    });
    expect(onPoll).not.toHaveBeenCalled();
    expect(clicked).toEqual([]);
  });
});
