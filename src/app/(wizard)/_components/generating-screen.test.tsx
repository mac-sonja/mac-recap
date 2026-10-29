// @vitest-environment happy-dom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GENERATING_REFRESH_MS } from "@/shared/case-status";
import { it as dict } from "@/shared/i18n/it";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

const { GeneratingScreen } = await import("./generating-screen");

beforeEach(() => {
  refresh.mockReset();
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("GeneratingScreen", () => {
  it("says what is happening, with no progress bar, and links back to the list", () => {
    render(<GeneratingScreen />);
    expect(screen.getByText(dict.wizard.generate.waiting.heading)).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByRole("link", { name: dict.wizard.back }).getAttribute("href")).toBe("/case-studies");
  });

  it("asks the server again about every 5 seconds, and stops when it goes away", () => {
    const { unmount } = render(<GeneratingScreen />);
    act(() => void vi.advanceTimersByTime(GENERATING_REFRESH_MS * 2));
    expect(refresh).toHaveBeenCalledTimes(2);
    unmount();
    act(() => void vi.advanceTimersByTime(GENERATING_REFRESH_MS * 2));
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
