// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResult } from "@/app/_lib/action-result";
import type { Page } from "@/modules/generation";
import { DEBOUNCE_MS } from "../use-autosave-fields";
import { BANNER_AFTER, HISTORY_LIMIT, RETRY_DELAYS_MS, useDocument, type Formats, type SaveInput, type UseDocumentOptions } from "./use-document";

const page = (name: string) => ({ pageKey: "cover", name }) as unknown as Page;
const formatsNamed = (name: string): Formats => ({ presentazione_16_9: [page(name)], carosello_1_1: [], video_9_16: [] });
const START = formatsNamed("start");

type Save = (input: SaveInput) => Promise<ActionResult<{ version: number }>>;
const okSave: Save = async (input) => ({ ok: true, value: { version: input.expectedVersion + 1 } });
const refused = (code: string, status = 409): ActionResult<never> => ({ ok: false, status, error: { code, message: "m" } });

function setup(over: Partial<UseDocumentOptions> = {}) {
  const save = vi.fn<Save>(okSave);
  const onStale = vi.fn();
  const options: UseDocumentOptions = {
    caseId: "aaaaaaaa-0000-4000-8000-000000000001",
    revision: { id: "dddddddd-0000-4000-8000-000000000001", version: 4, editable: true },
    base: { schemaVersion: 2, kind: "case_history", template: "mac-case@1" },
    initial: START,
    save,
    onStale,
    ...over,
  };
  const hook = renderHook(() => useDocument(options));
  return { hook, save: options.save as typeof save, onStale };
}

/** Lets pending timers and the save promise chain run. */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useDocument", () => {
  it("saves the whole document after the debounce with the version, then the returned one", async () => {
    const { hook, save } = setup();
    act(() => hook.result.current.change(formatsNamed("a"), "presentazione_16_9"));
    expect(save).not.toHaveBeenCalled();
    // Waiting for the debounce already reads Salvataggio….
    expect(hook.result.current.save).toBe("saving");
    await advance(DEBOUNCE_MS);
    expect(save).toHaveBeenCalledWith({
      caseId: "aaaaaaaa-0000-4000-8000-000000000001",
      revisionId: "dddddddd-0000-4000-8000-000000000001",
      doc: { schemaVersion: 2, kind: "case_history", template: "mac-case@1", formats: { presentazione_16_9: { pages: [page("a")] }, carosello_1_1: { pages: [] }, video_9_16: { pages: [] } } },
      expectedVersion: 4,
    });
    expect(hook.result.current.save).toBe("saved");
    act(() => hook.result.current.change(formatsNamed("b"), "presentazione_16_9"));
    act(() => hook.result.current.flush());
    await advance(0);
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ expectedVersion: 5 }));
  });

  it("shows Salvataggio… while a save runs and sends edits made meanwhile right after it, one at a time", async () => {
    let finish: (value: ActionResult<{ version: number }>) => void = () => {};
    const save = vi.fn<Save>().mockImplementationOnce(() => new Promise((resolve) => (finish = resolve))).mockImplementation(okSave);
    const { hook } = setup({ save });
    act(() => hook.result.current.change(formatsNamed("a"), "presentazione_16_9"));
    await advance(DEBOUNCE_MS);
    expect(hook.result.current.save).toBe("saving");
    act(() => hook.result.current.change(formatsNamed("b"), "presentazione_16_9"));
    await advance(DEBOUNCE_MS);
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => finish({ ok: true, value: { version: 5 } }));
    await advance(0);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]![0]).toMatchObject({ expectedVersion: 5, doc: { formats: { presentazione_16_9: { pages: [page("b")] } } } });
    expect(hook.result.current.save).toBe("saved");
  });

  it("retries a failed save with backoff, shows the banner after 3 failures and clears it on success", async () => {
    const save = vi.fn<Save>().mockRejectedValue(new Error("offline"));
    const { hook } = setup({ save });
    act(() => hook.result.current.change(formatsNamed("a"), "presentazione_16_9"));
    await advance(DEBOUNCE_MS);
    expect(hook.result.current.save).toBe("retrying");
    expect(hook.result.current.banner).toBe(false);
    await advance(RETRY_DELAYS_MS[0]);
    await advance(RETRY_DELAYS_MS[1]);
    expect(save).toHaveBeenCalledTimes(BANNER_AFTER);
    expect(hook.result.current.banner).toBe(true);
    // A refusal that isn't stale (e.g. ASSET_NOT_ALLOWED) counts as a failure too.
    save.mockResolvedValueOnce(refused("ASSET_NOT_ALLOWED", 400));
    await advance(RETRY_DELAYS_MS[2]);
    expect(save).toHaveBeenCalledTimes(4);
    save.mockImplementation(okSave);
    await advance(RETRY_DELAYS_MS[3] - 1);
    expect(save).toHaveBeenCalledTimes(4);
    await advance(1);
    expect(save).toHaveBeenCalledTimes(5);
    expect(hook.result.current).toMatchObject({ save: "saved", banner: false });
  });

  it.each(["STALE_REVISION", "STALE_HEAD", "REVISION_NOT_WRITABLE", "CASE_NOT_EDITABLE"])("reloads on %s and never retries", async (code) => {
    const save = vi.fn<Save>().mockResolvedValue(refused(code));
    const { hook, onStale } = setup({ save });
    act(() => hook.result.current.change(formatsNamed("a"), "presentazione_16_9"));
    await advance(DEBOUNCE_MS);
    expect(onStale).toHaveBeenCalledTimes(1);
    await advance(60_000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("makes one undo step per group, switches back to the format it changed, and saves an undo", async () => {
    const { hook, save } = setup();
    act(() => hook.result.current.change(formatsNamed("a"), "presentazione_16_9", "s1"));
    act(() => hook.result.current.change(formatsNamed("ab"), "presentazione_16_9", "s1"));
    act(() => hook.result.current.change({ ...formatsNamed("ab"), carosello_1_1: [page("c")] }, "carosello_1_1"));
    expect(hook.result.current.canUndo).toBe(true);
    let changed: string | undefined;
    act(() => {
      changed = hook.result.current.undo();
    });
    expect(changed).toBe("carosello_1_1");
    act(() => {
      changed = hook.result.current.undo();
    });
    expect(changed).toBe("presentazione_16_9");
    expect(hook.result.current.formats).toBe(START);
    expect(hook.result.current).toMatchObject({ canUndo: false, canRedo: true });
    act(() => {
      changed = hook.result.current.redo();
    });
    expect(hook.result.current.formats).toEqual(formatsNamed("ab"));
    await advance(DEBOUNCE_MS);
    expect(save.mock.calls.at(-1)![0].doc.formats.presentazione_16_9.pages).toEqual([page("ab")]);
  });

  it("keeps at most HISTORY_LIMIT steps", () => {
    const { hook } = setup();
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) act(() => hook.result.current.change(formatsNamed(`v${i}`), "presentazione_16_9"));
    let undone = 0;
    act(() => {
      while (hook.result.current.undo() !== undefined) undone++;
    });
    expect(undone).toBe(HISTORY_LIMIT);
  });

  it("saves nothing for a revision that isn't editable", async () => {
    const { hook, save } = setup({ revision: { id: "dddddddd-0000-4000-8000-000000000001", version: 4, editable: false } });
    act(() => hook.result.current.change(formatsNamed("a"), "presentazione_16_9"));
    await advance(DEBOUNCE_MS);
    expect(save).not.toHaveBeenCalled();
  });
});
