// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fill, it as dict } from "@/shared/i18n/it";
import { EMPTY_STATE, type FacetOptions, type LibraryState } from "../_lib/library-data";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace }) }));

const { LibraryFilters, SEARCH_DEBOUNCE_MS } = await import("./library-filters");

const options: FacetOptions = {
  clients: [
    { code: "ACM", name: "Acme Spa" },
    { code: "LUM", name: "Lumen Srl" },
  ],
  years: [2026, 2025],
};

const NO_SCROLL = { scroll: false };

function show(state: Partial<LibraryState> = {}) {
  return render(
    <LibraryFilters state={{ ...EMPTY_STATE, ...state }} options={options}>
      <p>griglia</p>
    </LibraryFilters>,
  );
}

const search = () => screen.getByRole("searchbox", { name: dict.library.search.label });
const chip = (name: string) => screen.getByRole("button", { name: new RegExp(name) });

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("LibraryFilters", () => {
  it("pushes a chip's value on page 1, keeping the other facets", () => {
    show({ years: [2025], page: 3 });
    fireEvent.click(chip("Lumen Srl"));
    expect(push).toHaveBeenCalledExactlyOnceWith("/library?cliente=LUM&anno=2025", NO_SCROLL);
    expect(chip("Lumen Srl")).toBeTruthy();
  });

  it("marks a selected chip as pressed and removes its value on a second click", () => {
    show({ clients: ["LUM", "ACM"] });
    const lumen = screen.getByRole("button", { name: "Lumen Srl", pressed: true });
    fireEvent.click(lumen);
    expect(push).toHaveBeenCalledExactlyOnceWith("/library?cliente=ACM", NO_SCROLL);
  });

  it("replaces the address with the search only after the debounce, on page 1", () => {
    show({ page: 2 });
    fireEvent.change(search(), { target: { value: "lum" } });
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1));
    expect(replace).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(replace).toHaveBeenCalledExactlyOnceWith("/library?q=lum", NO_SCROLL);
    expect(push).not.toHaveBeenCalled();
  });

  it("keeps a chip clicked within the debounce: the pending search never undoes it", () => {
    show();
    fireEvent.change(search(), { target: { value: "lum" } });
    fireEvent.click(chip("Acme Spa"));
    expect(push).toHaveBeenCalledExactlyOnceWith("/library?q=lum&cliente=ACM", NO_SCROLL);
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2));
    expect(replace).not.toHaveBeenCalled();
    expect((search() as HTMLInputElement).value).toBe("lum");
  });

  it("keeps the typed text while the navigation is pending, and takes a new query from Back", () => {
    const { rerender } = show();
    fireEvent.change(search(), { target: { value: "lum" } });
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    fireEvent.change(search(), { target: { value: "lume" } });
    // The page still has the old state; a re-render with it keeps the field as typed.
    rerender(
      <LibraryFilters state={EMPTY_STATE} options={options}>
        <p>griglia</p>
      </LibraryFilters>,
    );
    expect((search() as HTMLInputElement).value).toBe("lume");
    // The query just sent arrives: still as typed.
    rerender(
      <LibraryFilters state={{ ...EMPTY_STATE, q: "lum" }} options={options}>
        <p>griglia</p>
      </LibraryFilters>,
    );
    expect((search() as HTMLInputElement).value).toBe("lume");
    // Another query arrives (Back): the field shows it.
    rerender(
      <LibraryFilters state={{ ...EMPTY_STATE, q: "acme" }} options={options}>
        <p>griglia</p>
      </LibraryFilters>,
    );
    expect((search() as HTMLInputElement).value).toBe("acme");
  });

  it("removes an active filter, and Azzera tutto clears everything", () => {
    show({ q: "lum", clients: ["LUM", "ACM"], years: [2025], page: 2 });
    fireEvent.click(screen.getByRole("button", { name: fill(dict.library.active.remove, { value: "Lumen Srl" }) }));
    expect(push).toHaveBeenLastCalledWith("/library?q=lum&cliente=ACM&anno=2025", NO_SCROLL);
    fireEvent.click(screen.getByRole("button", { name: fill(dict.library.active.remove, { value: "2025" }) }));
    expect(push).toHaveBeenLastCalledWith("/library?q=lum&cliente=LUM&cliente=ACM", NO_SCROLL);
    fireEvent.click(screen.getByRole("button", { name: fill(dict.library.active.remove, { value: "“lum”" }) }));
    expect(push).toHaveBeenLastCalledWith("/library?cliente=LUM&cliente=ACM&anno=2025", NO_SCROLL);
    fireEvent.click(screen.getByRole("button", { name: dict.library.active.clearAll }));
    expect(push).toHaveBeenLastCalledWith("/library", NO_SCROLL);
    expect((search() as HTMLInputElement).value).toBe("");
  });

  it("shows no active filters without a search or a facet", () => {
    show();
    expect(screen.queryByRole("group", { name: dict.library.active.label })).toBeNull();
    expect(screen.getByText("griglia")).toBeTruthy();
  });
});
