// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DRAFT_READY_POLL_MS, DRAFT_READY_TOAST_MS } from "@/app/_lib/draft-ready";
import { fill, it as dict } from "@/shared/i18n/it";

const { listReadyDrafts, location } = vi.hoisted(() => ({
  listReadyDrafts: vi.fn(),
  location: { pathname: "/clients", search: "" },
}));
vi.mock("@/app/_lib/draft-ready-actions", () => ({ listReadyDrafts }));
vi.mock("next/navigation", () => ({
  usePathname: () => location.pathname,
  useSearchParams: () => new URLSearchParams(location.search),
}));

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
  return renderAgain();
}

/** Another layout's notifier in the same page load (same module, same session). */
async function renderAgain() {
  const { DraftReadyNotifier } = await import("./draft-ready-notifier");
  return render(<DraftReadyNotifier startedAt={STARTED_AT} />);
}

const liveRegion = () => document.querySelector("[data-draft-ready-live]") as HTMLElement;

/** Runs the timers by `ms` and lets the poll's promise settle. */
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

/** One poll interval. */
const poll = () => advance(DRAFT_READY_POLL_MS);

const toasts = () => screen.queryAllByTestId("draft-ready-toast");

let visibility: DocumentVisibilityState = "visible";

beforeEach(() => {
  vi.useFakeTimers();
  listReadyDrafts.mockReset().mockResolvedValue({ ok: true, value: [] });
  visibility = "visible";
  location.pathname = "/clients";
  location.search = "";
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

  it("announces each new toast in one persistent polite live region, without taking focus", async () => {
    render(<input aria-label="Titolo" />);
    const field = screen.getByLabelText("Titolo");
    field.focus();
    listReadyDrafts.mockResolvedValue({ ok: true, value: [draft(1)] });
    await renderNotifier();
    const region = liveRegion();
    expect(region.getAttribute("role")).toBe("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.className).toContain("sr-only");
    expect(region.textContent).toBe("");
    expect(screen.queryByRole("region", { name: dict.draftReady.region })).toBeNull();

    await poll();
    expect(liveRegion()).toBe(region);
    expect(region.textContent).toBe(title(1));
    expect(screen.getByRole("region", { name: dict.draftReady.region })).toBeTruthy();
    expect(toasts()[0].textContent).toContain(title(1));
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

  it.each([
    ["with a modifier key", { button: 0, metaKey: true }],
    ["with ctrl", { button: 0, ctrlKey: true }],
    ["with a non-primary button", { button: 1 }],
  ])("keeps the toast when Apri is clicked %s", async (_label, init) => {
    listReadyDrafts.mockResolvedValue({ ok: true, value: [draft(1)] });
    await renderNotifier();
    await poll();
    const open = screen.getByRole("link", { name: dict.draftReady.open });
    // The link opens elsewhere (a new tab); keep the browser from navigating the test page.
    open.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(open, init);
    expect(toasts()).toHaveLength(1);
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

  it("shows at most 3 at once and the rest at the next poll", async () => {
    listReadyDrafts.mockResolvedValue({ ok: true, value: [draft(1), draft(2), draft(3), draft(4)] });
    await renderNotifier();
    await poll();
    expect(toasts().map((t) => t.querySelector("p")?.textContent)).toEqual([title(1), title(2), title(3)]);
    await poll();
    expect(toasts().map((t) => t.querySelector("p")?.textContent)).toEqual([title(4)]);
    await poll();
    // Case 4 timed out at 40 s; nobody comes back.
    expect(toasts()).toHaveLength(0);
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
    // The next layout mounts its own notifier in the same page load (same module), rendered later.
    const { DraftReadyNotifier } = await import("./draft-ready-notifier");
    render(<DraftReadyNotifier startedAt="2026-11-04T10:30:00.000Z" />);
    expect(toasts()).toHaveLength(1);
    fireEvent.pointerEnter(toasts()[0]);
    await poll();
    expect(listReadyDrafts).toHaveBeenLastCalledWith({ since: STARTED_AT });
    expect(toasts()).toHaveLength(1);
  });

  it("keeps a toast's time left across a remount and does not announce it again", async () => {
    listReadyDrafts.mockResolvedValueOnce({ ok: true, value: [draft(1)] });
    const { unmount } = await renderNotifier();
    await poll();
    await advance(4_000);
    unmount();
    await renderAgain();
    expect(toasts()).toHaveLength(1);
    expect(liveRegion().textContent).toBe("");
    await advance(DRAFT_READY_TOAST_MS - 4_000 - 100);
    expect(toasts()).toHaveLength(1);
    await advance(100);
    expect(toasts()).toHaveLength(0);
  });

  it("keeps the 15-second rhythm across a remount: waits the rest, or asks at once when it is due", async () => {
    const { unmount } = await renderNotifier();
    await advance(10_000);
    unmount();
    const second = await renderAgain();
    await advance(DRAFT_READY_POLL_MS - 10_000 - 1);
    expect(listReadyDrafts).not.toHaveBeenCalled();
    await advance(1);
    expect(listReadyDrafts).toHaveBeenCalledTimes(1);
    second.unmount();
    await advance(DRAFT_READY_POLL_MS + 5_000);
    await renderAgain();
    await advance(0);
    expect(listReadyDrafts).toHaveBeenCalledTimes(2);
  });

  it("leaves a draft unseen when its poll settles after unmount, so the next notifier shows it", async () => {
    let settle: (value: unknown) => void = () => undefined;
    listReadyDrafts.mockReturnValueOnce(new Promise((resolve) => (settle = resolve)));
    listReadyDrafts.mockResolvedValue({ ok: true, value: [draft(1)] });
    const { unmount } = await renderNotifier();
    await poll();
    unmount();
    await act(async () => settle({ ok: true, value: [draft(1)] }));
    await renderAgain();
    expect(toasts()).toHaveLength(0);
    await poll();
    expect(toasts()).toHaveLength(1);
    expect(liveRegion().textContent).toBe(title(1));
  });

  it.each([
    ["its configurator", "/case-studies/aaaaaaaa-0000-4000-8000-000000000001/configurator", ""],
    ["its generating screen", "/case-studies/new", "?caseId=aaaaaaaa-0000-4000-8000-000000000001&step=3"],
  ])("gives no toast for the case whose page is open (%s), then or later", async (_label, pathname, search) => {
    location.pathname = pathname;
    location.search = search;
    listReadyDrafts.mockResolvedValue({ ok: true, value: [draft(1)] });
    await renderNotifier();
    await poll();
    expect(toasts()).toHaveLength(0);
    location.pathname = "/clients";
    location.search = "";
    await renderAgain();
    await poll();
    expect(toasts()).toHaveLength(0);
  });

  it.each([401, 403])("stops polling after a %i", async (status) => {
    listReadyDrafts.mockResolvedValue({ ok: false, status, error: { code: "FORBIDDEN", message: "m" } });
    const { unmount } = await renderNotifier();
    await poll();
    await poll();
    expect(listReadyDrafts).toHaveBeenCalledTimes(1);
    visibility = "visible";
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    unmount();
    await renderAgain();
    await advance(DRAFT_READY_POLL_MS * 2);
    expect(listReadyDrafts).toHaveBeenCalledTimes(1);
  });

  it("stops polling when it goes away", async () => {
    const { unmount } = await renderNotifier();
    unmount();
    await advance(DRAFT_READY_POLL_MS * 2);
    expect(listReadyDrafts).not.toHaveBeenCalled();
  });

  describe("a client's intro (Story 3.11)", () => {
    const CLIENT_ID = "cccccccc-0000-4000-8000-000000000001";
    const intro = { kind: "client_intro" as const, id: CLIENT_ID, name: "Lumen Srl", readyAt: "2026-11-04T10:00:03.000000+00:00" };
    const introTitle = fill(dict.draftReady.introTitle, { name: "Lumen Srl" });

    it("toasts that the intro is ready and Apri opens the client page", async () => {
      listReadyDrafts.mockResolvedValue({ ok: true, value: [intro] });
      await renderNotifier();
      await poll();
      expect(toasts()[0].textContent).toContain(introTitle);
      expect(liveRegion().textContent).toBe(introTitle);
      expect(screen.getByRole("link", { name: dict.draftReady.open }).getAttribute("href")).toBe(`/clients/${CLIENT_ID}`);
    });

    it("gives no toast while the client's page is open", async () => {
      location.pathname = `/clients/${CLIENT_ID}`;
      listReadyDrafts.mockResolvedValue({ ok: true, value: [intro] });
      await renderNotifier();
      await poll();
      expect(toasts()).toHaveLength(0);
    });

    it("toasts a case whose id is the open client page's (a case is open only in its configurator)", async () => {
      location.pathname = `/clients/${draft(1).id}`;
      listReadyDrafts.mockResolvedValue({ ok: true, value: [{ ...draft(1), kind: "case" }] });
      await renderNotifier();
      await poll();
      expect(toasts()).toHaveLength(1);
    });
  });
});
