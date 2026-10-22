/**
 * Whether the client panel was opened by a link in the app (**Aggiungi cliente**,
 * **Modifica**), which pushed a history entry: closing it then goes back instead of
 * adding another entry. A panel opened from a typed URL or a reload replaces instead.
 */
let openedInApp = false;

/** Called by the links that open the panel. */
export function markPanelOpenedInApp() {
  openedInApp = true;
}

/** Read by the panel when it opens (not consumed, so a dev double render reads the same). */
export function panelOpenedInApp() {
  return openedInApp;
}

/** Reset once the panel has read it, so a later reload of the panel URL replaces. */
export function clearPanelOpenedInApp() {
  openedInApp = false;
}
