"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { DocumentElement, Page } from "@/modules/generation";
import { isOwnText } from "./text-editing";

/** The ids of a page's texts that hold their own words, inside Testi groups and rows too. */
export function ownTextIds(page: Page): string[] {
  const ids: string[] = [];
  const walk = (elements: readonly DocumentElement[]) => {
    for (const el of elements) {
      if (isOwnText(el)) ids.push(el.elementId);
      if (el.type === "text_group" || el.type === "row") walk(el.items);
    }
  };
  for (const block of page.blocks) walk(block.elements);
  return ids;
}

/** Elements a browser may wrap a typed line in. */
const LINE_ELEMENTS = new Set(["DIV", "P"]);

/**
 * A text node's words as typed, line breaks kept. Read from the DOM, not `innerText`,
 * which applies the template's CSS (an Etichetta's capitals would be saved as typed
 * capitals). A `<br>` is a line break, and a line the browser wrapped in a `<div>` or
 * `<p>` starts a new line.
 */
export function typedText(node: Node, top = true): string {
  let out = "";
  node.childNodes.forEach((child, i) => {
    if (child.nodeType === Node.TEXT_NODE) out += child.nodeValue ?? "";
    // The text's own last <br> is the browser's placeholder for an empty last line, not a typed break
    // (inside a wrapped line, a lone <br> is an empty line).
    else if (child.nodeName === "BR") out += top && i === node.childNodes.length - 1 ? "" : "\n";
    else if (child.nodeType === Node.ELEMENT_NODE) {
      if (LINE_ELEMENTS.has(child.nodeName) && i > 0 && !out.endsWith("\n")) out += "\n";
      out += typedText(child, false);
    }
  });
  return out;
}

/** Makes `node` editable as plain text (line breaks, no formatting). */
function makeEditable(node: HTMLElement) {
  node.setAttribute("contenteditable", "plaintext-only");
  node.setAttribute("spellcheck", "true");
}

function placeCaretAtEnd(node: HTMLElement) {
  const selection = window.getSelection?.();
  if (!selection || typeof document.createRange !== "function") return;
  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

export interface InPlaceTextOptions {
  /** The rendered page's host. */
  host: RefObject<HTMLElement | null>;
  page: Page;
  /**
   * Which texts can be typed in: in the editor only `editing` (set by a double-click or
   * Enter), in Anteprima every own text, placed with a click (C37). Null: none.
   */
  mode: { kind: "editor"; editing: string | null } | { kind: "preview" } | null;
  /** The words of `elementId` as typed so far. */
  onInput: (elementId: string, text: string) => void;
  /** The editing session of `elementId` ended (Esc, or focus left it). */
  onDone: (elementId: string) => void;
}

/**
 * Typing in a text of a page drawn by the renderer (Story 4.3a). The node gets
 * `contenteditable="plaintext-only"`; while a session runs, the page is drawn from the
 * snapshot taken when it started, so React never touches the words being typed (the
 * document still changes on every input). When the session ends the page is drawn
 * afresh from the document (`renderKey` changes), so the markup is the renderer's again.
 * Esc ends the session, as does focus leaving the text.
 */
export function useInPlaceText({ host, page, mode, onInput, onDone }: InPlaceTextOptions): { shown: Page; renderKey: number; active: string | null } {
  const [session, setSession] = useState<{ elementId: string; snapshot: Page } | null>(null);
  const [renderKey, setRenderKey] = useState(0);
  const callbacks = useRef({ onInput, onDone });
  useEffect(() => {
    callbacks.current = { onInput, onDone };
  });
  const pageRef = useRef(page);
  useEffect(() => {
    pageRef.current = page;
  });

  const editing = mode?.kind === "editor" ? mode.editing : null;
  const preview = mode?.kind === "preview";
  const editableKey = preview ? ownTextIds(page).join(",") : (editing ?? "");

  // Mark the editable texts (again after every redraw), and focus the one the editor opened.
  useLayoutEffect(() => {
    const el = host.current;
    if (el === null || editableKey === "") return;
    const nodes = editableKey
      .split(",")
      .map((id) => el.querySelector<HTMLElement>(`[data-element-id="${id}"]`))
      .filter((node): node is HTMLElement => node !== null);
    for (const node of nodes) makeEditable(node);
    if (editing !== null && nodes[0] !== undefined && document.activeElement !== nodes[0]) {
      nodes[0].focus();
      placeCaretAtEnd(nodes[0]);
    }
    return () => {
      for (const node of nodes) node.removeAttribute("contenteditable");
    };
  }, [host, editableKey, editing, renderKey]);

  useEffect(() => {
    const el = host.current;
    if (el === null) return;
    const textOf = (target: EventTarget | null) =>
      target instanceof HTMLElement && target.hasAttribute("contenteditable") ? target.closest<HTMLElement>("[data-element-id]") : null;

    function onFocusIn(event: FocusEvent) {
      const node = textOf(event.target);
      const id = node?.dataset.elementId;
      if (id === undefined) return;
      setSession((current) => current ?? { elementId: id, snapshot: pageRef.current });
    }
    function onInputEvent(event: Event) {
      const node = textOf(event.target);
      const id = node?.dataset.elementId;
      if (node && id !== undefined) callbacks.current.onInput(id, typedText(node));
    }
    function onFocusOut(event: FocusEvent) {
      const node = textOf(event.target);
      const id = node?.dataset.elementId;
      if (node === null || id === undefined) return;
      callbacks.current.onInput(id, typedText(node));
      setSession(null);
      setRenderKey((k) => k + 1);
      callbacks.current.onDone(id);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const node = textOf(event.target);
      if (node === null) return;
      // Esc ends the session; it is not a selection step or a way out of Anteprima.
      event.preventDefault();
      event.stopPropagation();
      node.blur();
    }
    el.addEventListener("focusin", onFocusIn);
    el.addEventListener("input", onInputEvent);
    el.addEventListener("focusout", onFocusOut);
    el.addEventListener("keydown", onKeyDown);
    return () => {
      el.removeEventListener("focusin", onFocusIn);
      el.removeEventListener("input", onInputEvent);
      el.removeEventListener("focusout", onFocusOut);
      el.removeEventListener("keydown", onKeyDown);
    };
  }, [host]);

  return { shown: session?.snapshot ?? page, renderKey, active: session?.elementId ?? null };
}
