"use client";

import { useEffect, useRef, useState } from "react";

/** Idle time after the last keystroke before a field saves. */
export const DEBOUNCE_MS = 800;

/** One field's save bookkeeping, outside React state so overlapping saves see it at once. */
interface FieldSave {
  timer: ReturnType<typeof setTimeout> | null;
  /** The save loop running for this field, if any. */
  inFlight: Promise<void> | null;
  /** Set when a save is asked for while one is in flight: the loop saves the latest text once more. */
  again: boolean;
  /** The text the server holds. */
  saved: string;
}

export interface AutosaveFieldsOptions<F extends string> {
  /** The fields, in display order. */
  fields: readonly F[];
  /** The saved texts; `""` for a field never saved. */
  initial: Readonly<Record<F, string>>;
  /** Sends one field's text; resolves true when the server now holds it. A throw counts as a failure. */
  save: (field: F, text: string) => Promise<boolean>;
  /** Text over the limit is never sent. */
  tooLong: (text: string) => boolean;
  /**
   * Whether the record exists yet, so saving is possible (default: always). While
   * false, edits only change the values: no debounce, blur, link or unmount save.
   * An explicit `flushAll` checks it too, so set it (e.g. through a ref) first.
   */
  active?: () => boolean;
  /**
   * Other unsaved state on the step (e.g. fields saved only on Avanti): while it
   * returns true a same-origin link is stopped and handed to `onUnsavedLink` too.
   * Checked only while `active`.
   */
  hasOtherUnsaved?: () => boolean;
  /** A save failed (the field now shows its error): e.g. announce it. */
  onSaveFailed?: (field: F) => void;
  /** A same-origin link was clicked while a field is unsaved: the click is stopped, so this leaves once saved. */
  onUnsavedLink: (href: string) => void;
}

export interface AutosaveFields<F extends string> {
  values: Readonly<Record<F, string>>;
  /** The fields whose last save failed. */
  failed: ReadonlySet<F>;
  /** Records an edit and schedules its save after {@link DEBOUNCE_MS}. */
  change: (field: F, text: string) => void;
  /** Saves the field's latest text now (pending debounce flushed); resolves when the field is settled. */
  save: (field: F) => Promise<void>;
  /** Flushes every field; true when the server now holds every field's text. */
  flushAll: () => Promise<boolean>;
  /** The first field whose text the server does not hold, if any. */
  firstUnsaved: () => F | undefined;
  /** The latest values, synchronously (also between renders). */
  current: () => Readonly<Record<F, string>>;
}

/**
 * The autosave loop of a wizard's text fields (Story 2.10, reused by the client
 * wizard in Story 2.15). Each field saves after {@link DEBOUNCE_MS} of idle time
 * and on blur (`save`), only when its text changed. One save per field runs at a
 * time; text typed meanwhile is saved after it. A failed save keeps the text, marks
 * the field failed and retries on the next edit or blur. A same-origin link clicked
 * while something is unsaved is stopped and handed to `onUnsavedLink`; a reload or
 * tab close flushes best effort; unmounting with a pending or failed field saves it.
 */
export function useAutosaveFields<F extends string>(options: AutosaveFieldsOptions<F>): AutosaveFields<F> {
  const { fields, initial } = options;
  const [values, setValues] = useState<Record<F, string>>(() => ({ ...initial }));
  const [failed, setFailed] = useState<ReadonlySet<F>>(() => new Set());

  const valuesRef = useRef<Record<F, string>>(values);
  const saves = useRef<Record<F, FieldSave>>(
    Object.fromEntries(fields.map((field) => [field, { timer: null, inFlight: null, again: false, saved: initial[field] }])) as Record<
      F,
      FieldSave
    >,
  );
  const unmounted = useRef(false);
  // The latest options, for callbacks bound once.
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const isActive = () => optionsRef.current.active?.() ?? true;
  const tooLong = (text: string) => optionsRef.current.tooLong(text);

  function markFailed(field: F, on: boolean) {
    if (unmounted.current) return;
    setFailed((current) => {
      if (current.has(field) === on) return current;
      const next = new Set(current);
      if (on) next.add(field);
      else next.delete(field);
      return next;
    });
  }

  function clearTimer(field: F) {
    const state = saves.current[field];
    if (state.timer !== null) clearTimeout(state.timer);
    state.timer = null;
  }

  function save(field: F): Promise<void> {
    clearTimer(field);
    if (!isActive()) return Promise.resolve();
    const state = saves.current[field];
    if (state.inFlight !== null) {
      state.again = true;
      return state.inFlight;
    }
    const first = valuesRef.current[field];
    if (first === state.saved) markFailed(field, false);
    if (tooLong(first) || first === state.saved) return Promise.resolve();

    state.inFlight = (async () => {
      try {
        do {
          state.again = false;
          const text = valuesRef.current[field];
          if (text === state.saved) markFailed(field, false);
          if (tooLong(text) || text === state.saved) break;
          let ok: boolean;
          try {
            ok = await optionsRef.current.save(field, text);
          } catch {
            ok = false;
          }
          if (ok) {
            state.saved = text;
            markFailed(field, false);
          } else {
            markFailed(field, true);
            if (!unmounted.current) optionsRef.current.onSaveFailed?.(field);
          }
        } while (state.again);
      } finally {
        state.inFlight = null;
      }
    })();
    return state.inFlight;
  }

  async function flushAll(): Promise<boolean> {
    await Promise.all(fields.map(save));
    return fields.every((field) => saves.current[field].saved === valuesRef.current[field]);
  }

  const settled = () =>
    !isActive() ||
    (!(optionsRef.current.hasOtherUnsaved?.() ?? false) &&
      fields.every((field) => {
      const state = saves.current[field];
      return state.timer === null && state.inFlight === null && state.saved === valuesRef.current[field];
      }));

  const firstUnsaved = () => fields.find((field) => saves.current[field].saved !== valuesRef.current[field]);

  // The latest closures for the document listeners below, which are bound once.
  const settledRef = useRef(settled);
  const flushRef = useRef(flushAll);
  const tooLongRef = useRef(tooLong);
  const activeRef = useRef(isActive);
  useEffect(() => {
    settledRef.current = settled;
    flushRef.current = flushAll;
    tooLongRef.current = tooLong;
    activeRef.current = isActive;
  });

  useEffect(() => {
    unmounted.current = false;
    const fieldSaves = saves.current;

    // A same-origin link clicked with unsaved text (stepper, back arrow) waits for the flush.
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || (anchor.target !== "" && anchor.target !== "_self")) return;
      if (anchor.origin !== window.location.origin || anchor.hasAttribute("download")) return;
      if (settledRef.current()) return;
      event.preventDefault();
      event.stopPropagation();
      optionsRef.current.onUnsavedLink(`${anchor.pathname}${anchor.search}${anchor.hash}`);
    }
    // Reload or tab close: best effort, the request may not finish.
    const onBeforeUnload = () => void flushRef.current();

    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
      unmounted.current = true;
      if (!activeRef.current()) return;
      // Leaving another way: a pending debounce, or a field still unsaved (a failed save), saves now.
      const unsaved = (field: F) => {
        const text = valuesRef.current[field];
        return fieldSaves[field].saved !== text && !tooLongRef.current(text);
      };
      if (fields.some((field) => fieldSaves[field].timer !== null || unsaved(field))) void flushRef.current();
    };
    // `fields` is a constant list: the listeners are bound once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function change(field: F, text: string) {
    valuesRef.current = { ...valuesRef.current, [field]: text };
    setValues(valuesRef.current);
    clearTimer(field);
    if (tooLong(text) || !isActive()) return;
    saves.current[field].timer = setTimeout(() => void save(field), DEBOUNCE_MS);
  }

  return { values, failed, change, save, flushAll, firstUnsaved, current: () => valuesRef.current };
}
