/**
 * The confirm-name rule of `delete_client`, exactly: runs of ASCII whitespace
 * (space, tab, LF, CR, FF, VT) become one space, then a leading or trailing space is
 * dropped. Any other character, a no-break space included, is kept as it is.
 * Client-safe: the delete dialog and the case-study module both use it.
 */
export function normalizeClientConfirmName(text: string): string {
  return text.replace(/[ \t\n\r\f\v]+/g, " ").replace(/^ | $/g, "");
}
