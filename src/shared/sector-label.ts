/**
 * Client sector names (owner, 2026-10-22), shared by the case-study domain and the
 * client panel. The server decides what counts as the same sector (`add_client_sector`
 * compares `client_name_key`, which folds with `unaccent`); these helpers are only a
 * shortcut and may fold some characters differently.
 */

/** A sector label as stored: whitespace runs collapsed to one space, trimmed. */
export function normalizeSectorLabel(label: string): string {
  return label.replace(/\s+/g, " ").trim();
}

/**
 * A close approximation of `client_name_key`: case, combining accents and extra spaces
 * aside. The client panel uses it to select a sector it already lists without a request;
 * anything it misses is still matched by the server.
 */
export function sectorLabelKey(label: string): string {
  return normalizeSectorLabel(label)
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase();
}
