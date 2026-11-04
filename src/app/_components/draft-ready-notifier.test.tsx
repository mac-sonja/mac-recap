// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DRAFT_READY_POLL_MS, DRAFT_READY_TOAST_MS } from "@/app/_lib/draft-ready";
import { fill, it as dict } from "@/shared/i18n/it";

const { listReadyDrafts } = vi.hoisted(() => ({ listReadyDrafts: vi.fn() }));
vi.mock("@/app/_lib/draft-ready-actions", () => ({ listReadyDrafts }));

const STARTED_AT = "2026-11-04T10:00:00.000Z";
const draft = (n: number) => ({
  id: `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`,
  name: `Case ${n}`,
  readyAt: `2026-11-04T10:00:${String(n).padStart(2, "0")}.000000+00:00`,
});
const title = (n: number) => fill(dict.draftReady.title, { name: `Case ${n}` });

/** A fresh module, so every test is a new page load (a new session). */
async function renderNotifier() {
  vi.resetModules();
  const { DraftReadyNotifier } = await import("./draft-ready-notifier");
  return render(<DraftReadyNotifier startedAt={STARTED_AT} />);
}

/** Runs the timers by `ms` and lets the poll's promise settle. */
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

/** One poll interval, then the moment after, when a new toast's message has filled in. */
const poll = async () => {
  await advance(DRAFT_READY_POLL_MS);
  await advance(0);
};

const toasts = () => screen.queryAllByTestId("draft-ready-toast");

let visibility: DocumentVisibilityState = "visible";

beforeEach(() => {
  vi.useFakeTimers();
  listReadyDrafts.mockReset().mockResolvedValue({ ok: true, value: [] });
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("DraftReadyNotifier (Story 3.8)", () => {
  it("asks every 15 seconds for the drafts ready since the page session began", async () => {
    await renderNotifier();
    await advance(DRAFT_READY_POLL_MS - 1);
    expect(listReadyDrafts).not.toHaveBeenCalled();
    await advance(1);
    expect(listReadyDrafts).toHaveBeenCalledTimes(1);
    expect(listReadyDrafts).toHaveBeenCalledWith({ since: STARTED_AT });
    await advance(DRAFT_READY_POLL_MS);
    expect(listReadyDrafts).toHaveBeenCalledTimes(2);
  });

  it("shows a polite toast with Apri to the configurator, without taking focus", async () => {
    render(<input aria-label="Titolo" />);
    const field = screen.getByLabelText("Titolo");
    field.focus();
    listReadyDrafts.mockResolvedValue({ ok: true, value: [draft(1)] });
    await renderNotifier();
    await poll();

    const status = screen.getByRole("status");
    expect(status.textContent).toBe(title(1));
    expect(status.getAttribute("aria-live")).toBe("polite");
    const open = screen.getByRole("link", { name: dict.draftReady.open });
    expect(open.getAttribute("href")).toBe("/case-studies/aaaaaaaa-0000-4000-8000-000000000001/configurator");
    expect(document.activeElement).toBe(field);
  });

  it("closes the toast on Apri", async () => {
    listReadyDrafts.mockResolvedValue({ ok: true, value: [draft(1)] });
    await renderNotifier();
    await poll();
    fireEvent.click(screen.getByRole("link", { name: dict.draftReady.open }));
    expect(toasts()).toHaveLength(0);
  });

  it("closes the toast on its close button", async () => {
    listReadyDrafts.mockResolvedValue({ ok: true, value: [draft(1)] });
    await renderNotifier();
    await poll();
    fireEvent.click(screen.getByRole("button", { name: dict.draftReady.close }));
    expect(toasts()).toHaveLength(0);
  });

  it("goes away by itself after 10 seconds", async () => {
    listReadyDrafts.mockResolvedValueOnce({ ok: true, value: [draft(1)] });
    await renderNotifier();
    await poll();
    await advance(DRAFT_READY_TOAST_MS - 100);
    expect(toasts()).toHaveLength(1);
    await advance(100);
    expect(toasts()).toHaveLength(0);
  });

  it("pauses the 10 seconds while hovered, and resumes with the time left", async () => {
    listReadyDrafts.mockResolvedValueOnce({ ok: true, value: [draft(1)] });
    await renderNotifier();
    await poll();
    await advance(4_000);
    fireEvent.pointerEnter(toasts()[0]);
    await advance(DRAFT_READY_TOAST_MS * 3);
    expect(toasts()).toHaveLength(1);
    fireEvent.pointerLeave(toasts()[0]);
    await advance(DRAFT_READY_TOAST_MS - 4_000 - 100);
    expect(toasts()).toHaveLength(1);
    await advance(100);
    expect(toasts()).toHaveLength(0);
  });

  it("pauses the 10 seconds while focus is inside it", async () => {
    listReadyDrafts.mockResolvedValueOnce({ ok: true, value: [draft(1)] });
    await renderNotifier();
    await poll();
    act(() => screen.getByRole("button", { name: dict.draftReady.close }).focus());
    await advance(DRAFT_READY_TOAST_MS * 3);
    expect(toasts()).toHaveLength(1);
    act(() => screen.getByRole("button", { name: dict.draftReady.close }).blur());
    await advance(DRAFT_READY_TOAST_MS);
    expect(toasts()).toHaveLength(0);
  });

  it("never shows the same case twice in a session", async () => {
    listReadyDrafts.mockResolvedValue({ ok: true, value: [draft(1)] });
    await renderNotifier();
    await poll();
    fireEvent.click(screen.getByRole("button", { name: dict.draftReady.close }));
    await advance(DRAFT_READY_POLL_MS * 3);
    expect(listReadyDrafts).toHaveBeenCalledTimes(4);
    expect(toasts()).toHaveLength(0);
  });

  it("stacks two at once, newest at the bottom", async () => {
    listReadyDrafts.mockResolvedValueOnce({ ok: true, value: [draft(2), draft(1)] });
    await renderNotifier();
    await poll();
    expect(toasts().map((t) => t.textContent)).toEqual([
      expect.stringContaining(title(1)),
      expect.stringContaining(title(2)),
    ]);
  });

  it("shows at most 3, the oldest making room", async () => {
    listReadyDrafts.mockResolvedValueOnce({ ok: true, value: [draft(1), draft(2), draft(3), draft(4)] });
    await renderNotifier();
    await poll();
    expect(toasts().map((t) => t.querySelector("[role=status]")?.textContent)).toEqual([title(2), title(3), title(4)]);
  });

  it("shows nothing when a poll fails, logs once, and tries again at the next interval", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    listReadyDrafts
      .mockResolvedValueOnce({ ok: false, status: 500, error: { code: "CASE_STUDY_LOOKUP_FAILED", message: "m" } })
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({ ok: true, value: [draft(1)] });
    await renderNotifier();
    await advance(DRAFT_READY_POLL_MS * 2);
    expect(toasts()).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1);
    await poll();
    expect(toasts()).toHaveLength(1);
  });

  it("pauses while the tab is hidden and asks once when it is shown again", async () => {
    await renderNotifier();
    visibility = "hidden";
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    await advance(DRAFT_READY_POLL_MS * 3);
    expect(listReadyDrafts).not.toHaveBeenCalled();
    visibility = "visible";
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    await advance(0);
    expect(listReadyDrafts).toHaveBeenCalledTimes(1);
    await poll();
    expect(listReadyDrafts).toHaveBeenCalledTimes(2);
  });

  it("does not poll in a tab that opens hidden until it is shown", async () => {
    visibility = "hidden";
    await renderNotifier();
    await advance(DRAFT_READY_POLL_MS * 2);
    expect(listReadyDrafts).not.toHaveBeenCalled();
  });

  it("appears without movement under reduced motion", async () => {
    listReadyDrafts.mockResolvedValue({ ok: true, value: [draft(1)] });
    await renderNotifier();
    await poll();
    const toast = toasts()[0];
    expect(toast.className).toContain("motion-safe:animate-enter");
    expect(toast.className).toContain("motion-reduce:animate-none");
  });

  it("keeps the session across client navigation: same start, no replay, toasts kept", async () => {
    listReadyDrafts.mockResolvedValue({ ok: true, value: [draft(1)] });
    const { unmount } = await renderNotifier();
    await poll();
    unmount();
    // The next layout mounts its own notifier in the same page load (same module).
    const { DraftReadyNotifier } = await import("./draft-ready-notifier");
    render(<DraftReadyNotifier startedAt="2026-11-04T10:30:00.000Z" />);
    expect(toasts()).toHaveLength(1);
    fireEvent.pointerEnter(toasts()[0]);
    await poll();
    expect(listReadyDrafts).toHaveBeenLastCalledWith({ since: STARTED_AT });
    expect(toasts()).toHaveLength(1);
  });

  it("stops polling when it goes away", async () => {
    const { unmount } = await renderNotifier();
    unmount();
    await advance(DRAFT_READY_POLL_MS * 2);
    expect(listReadyDrafts).not.toHaveBeenCalled();
  });
});
