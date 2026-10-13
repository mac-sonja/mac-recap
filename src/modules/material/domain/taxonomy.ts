import { z } from "zod";

/** The kinds of taxonomy term (the `taxonomy_term_kind_check` matches). */
export const TERM_KINDS = ["tag", "property", "flag"] as const;
export type TermKind = (typeof TERM_KINDS)[number];

/** What a term can describe: a project file (`asset`) or a pasted text (`text`); `material_term_ref_kind_check` matches. */
export const DELIVERABLE_KINDS = ["asset", "text"] as const;
export type DeliverableKind = (typeof DELIVERABLE_KINDS)[number];

/** A term's stable key; code refers to terms only by key (the `taxonomy_term_key_check` matches). */
export const TERM_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;
export const MAX_TERM_KEY_CHARS = 64;
/** Input bound on keys per set call (not a cardinality rule; there is no per-kind limit). */
export const MAX_KEYS_PER_SET = 100;

export const isTermKey = (key: string) => key.length <= MAX_TERM_KEY_CHARS && TERM_KEY_PATTERN.test(key);

/** A `taxonomy_term` row as the material module sees it (without its internal id). */
export const taxonomyTermSchema = z.object({
  kind: z.enum(TERM_KINDS),
  key: z.string().refine(isTermKey, "Not a term key."),
  label: z.string(),
});
export type TaxonomyTerm = z.infer<typeof taxonomyTermSchema>;

/** One selectable term; `label` is display-only. */
export interface Term {
  key: string;
  label: string;
}

/** Every term grouped by kind, each ordered by label; an unseeded kind is `[]`. */
export type TermsByKind = Record<TermKind, Term[]>;

/** The term keys of one live deliverable, per kind (all `[]` when untagged). */
export type DeliverableTerms = { refKind: DeliverableKind; refId: string } & Record<TermKind, string[]>;

/** One deliverable's links as the repository reads them. */
export const deliverableLinksSchema = z.object({
  refKind: z.enum(DELIVERABLE_KINDS),
  refId: z.uuid(),
  terms: z.array(z.object({ kind: z.enum(TERM_KINDS), key: z.string() })),
});
export type DeliverableLinks = z.infer<typeof deliverableLinksSchema>;

/**
 * Replaces one deliverable's terms of one kind. Keys are checked against the
 * taxonomy by the use case and the DB (an unknown or malformed key is
 * `UNKNOWN_TERM`, not `INVALID_INPUT`); more than MAX_KEYS_PER_SET keys or an
 * over-long key is `INVALID_INPUT` naming `keys`. No per-kind limit.
 */
export const setTermsInputSchema = z.object({
  caseId: z.uuid(),
  refKind: z.enum(DELIVERABLE_KINDS),
  refId: z.uuid(),
  kind: z.enum(TERM_KINDS),
  keys: z
    .array(z.string())
    .max(MAX_KEYS_PER_SET, `At most ${MAX_KEYS_PER_SET} keys.`)
    .refine((keys) => keys.every((key) => key.length <= MAX_TERM_KEY_CHARS), `Each key is at most ${MAX_TERM_KEY_CHARS} characters.`),
});
export type SetTermsInput = z.infer<typeof setTermsInputSchema>;

/** The case whose deliverables' terms are read. */
export const caseTermsInputSchema = z.object({ caseId: z.uuid() });

/** What `setDeliverableTerms` stored: the deliverable, the kind and its keys now. */
export interface TermsSet {
  refKind: DeliverableKind;
  refId: string;
  kind: TermKind;
  keys: string[];
}

/** Recorded through `case-study.recordEvent` with `{ refKind, refId, kind, keys }` (keys only, never labels). */
export const TERMS_SET = "terms_set";

/** `UNKNOWN_TERM` naming the key (cut to the longest valid key length, since it may be arbitrary input). */
export const unknownTerm = (key: string) => {
  const shown = key.slice(0, MAX_TERM_KEY_CHARS);
  return {
    code: "UNKNOWN_TERM" as const,
    message: shown === "" ? "Unknown term." : `Unknown term: ${shown}.`,
    details: { key: shown },
  };
};

/** Groups term rows (already ordered by label) by kind; every kind is present. */
export function groupTerms(terms: readonly TaxonomyTerm[]): TermsByKind {
  const grouped: TermsByKind = { tag: [], property: [], flag: [] };
  for (const { kind, key, label } of terms) grouped[kind].push({ key, label });
  return grouped;
}

/** One deliverable's links as keys per kind, keeping the read order. */
export function toDeliverableTerms({ refKind, refId, terms }: DeliverableLinks): DeliverableTerms {
  const result: DeliverableTerms = { refKind, refId, tag: [], property: [], flag: [] };
  for (const { kind, key } of terms) result[kind].push(key);
  return result;
}
