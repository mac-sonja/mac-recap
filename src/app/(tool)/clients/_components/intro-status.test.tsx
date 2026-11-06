// @vitest-environment happy-dom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GENERATING_REFRESH_MS } from "@/shared/case-status";
import { it as dict } from "@/shared/i18n/it";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

const { IntroStatus } = await import("./intro-status");

beforeEach(() => {
  refresh.mockReset();
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const wait = (n: number) => act(() => void vi.advanceTimersByTime(GENERATING_REFRESH_MS * n));

describe("IntroStatus (Story 3.11)", () => {
  it("shows Introduzione: and the badge in a polite status region", () => {
    render(<IntroStatus status="in_review" />);
    const region = screen.getByRole("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.textContent).toBe(`${dict.clients.detail.intro}${dict.status.in_review}`);
  });

  it("asks the server again once per interval while In elaborazione, and stops when it goes away", () => {
    const { unmount } = render(<IntroStatus status="generating" />);
    wait(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    wait(2);
    expect(refresh).toHaveBeenCalledTimes(3);
    unmount();
    wait(2);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it.each(["draft", "in_review", "approved"] as const)("never refreshes when %s", (status) => {
    render(<IntroStatus status={status} />);
    wait(3);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("stops refreshing once a rerender says Da approvare", () => {
    const { rerender } = render(<IntroStatus status="generating" />);
    wait(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    rerender(<IntroStatus status="in_review" />);
    wait(3);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toContain(dict.status.in_review);
  });
});
