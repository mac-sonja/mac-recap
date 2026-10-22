/**
 * Client sector names (owner, 2026-10-22), shared by the case-study domain and the
 * client panel, so both compare names as `add_client_sector` does in SQL.
 */

/** A sector label as stored: whitespace runs collapsed to one space, trimmed. */
export function normalizeSectorLabel(label: string): string {
  return label.replace(/\s+/g, " ").trim();
}

/**
 * Two sector labels name the same sector when they differ only in case, accents or
 * extra spaces (as `client_name_key` compares them in SQL).
 */
export function sectorLabelKey(label: string): string {
  return normalizeSectorLabel(label)
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase();
}
