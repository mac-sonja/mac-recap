// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { it as dict } from "@/shared/i18n/it";
import { UserMenu } from "./user-menu";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("UserMenu", () => {
  it("opens on click and closes on Escape, returning focus to the button", async () => {
    const user = userEvent.setup();
    render(<UserMenu displayName="Sonja Castillo" roleLabel="Owner/designer" />);
    const button = screen.getByRole("button", { name: dict.shell.userMenu.button });
    const panel = document.getElementById(button.getAttribute("aria-controls") ?? "");

    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(panel?.hidden).toBe(true);

    await user.click(button);

    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(panel?.hidden).toBe(false);
    expect(screen.getByText("Sonja Castillo")).toBeTruthy();
    expect(screen.getByText("Owner/designer")).toBeTruthy();

    // Focus is already on the button after the click, so also check the explicit refocus.
    const focus = vi.spyOn(button, "focus");
    await user.keyboard("{Escape}");

    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(panel?.hidden).toBe(true);
    expect(focus).toHaveBeenCalled();
    expect(document.activeElement).toBe(button);
  });
});
