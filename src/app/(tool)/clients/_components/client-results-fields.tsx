"use client";

import type { FocusEvent, RefObject } from "react";
import { FIELD, FIELD_HINT, FIELD_LABEL, TEXTAREA } from "@/app/_components/field-styles";
import type { ClientResult } from "@/modules/case-study";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import type { ClientLimits } from "../_lib/client-limits";

const copy = it.clientPanel.details;
const ERROR = "font-label text-xs text-danger";

/** Risultati always shows 3 rows (owner's mock, 2026-10-22). */
export const RESULT_ROWS = 3;

/** One Risultati row as typed: either part may be empty. */
export interface ResultRow {
  label: string;
  value: string;
}

/** Characters as the server counts them: code points, so an emoji is one. */
const charCount = (text: string) => [...text].length;

/** The saved results shown in the 3 rows, top first; the rows left over are empty. */
export function resultRowsOf(results: readonly ClientResult[]): ResultRow[] {
  return Array.from({ length: RESULT_ROWS }, (_, index) => ({ label: results[index]?.label ?? "", value: results[index]?.value ?? "" }));
}

/** What is saved: the rows with both parts filled, trimmed, top to bottom (half and empty rows are skipped). */
export function filledResults(rows: readonly ResultRow[]): ClientResult[] {
  return rows
    .map((row) => ({ label: row.label.trim(), value: row.value.trim() }))
    .filter((row) => row.label !== "" && row.value !== "");
}

/** A row with only one of its two parts: it shows a message and is not saved. */
export const isHalfRow = (row: ResultRow) => (row.label.trim() === "") !== (row.value.trim() === "");

/** What is saved of the testimonial, trimmed: an author without a quote is no testimonial (`""` and `""`). */
export function testimonialOf(quote: string, author: string): { quote: string; author: string } {
  const trimmedQuote = quote.trim();
  return trimmedQuote === "" ? { quote: "", author: "" } : { quote: trimmedQuote, author: author.trim() };
}

/** An author without a quote: it shows "Manca la frase." and is not saved. */
export const isAuthorOnly = (quote: string, author: string) => quote.trim() === "" && author.trim() !== "";

/** Whether a row part is over its limit, counted like the server (code points after trimming). */
export const isOver = (text: string, max: number) => charCount(text.trim()) > max;

/** The keys of the incomplete-entry messages: one per row, and the testimonial. */
export type IncompleteKey = `row-${number}` | "testimonial";

/** The inputs, for focusing the first one that needs attention (`rows` holds one slot per row). */
export interface StoryInputs {
  rows: Array<{ label: HTMLInputElement | null; value: HTMLInputElement | null }>;
  quote: HTMLTextAreaElement | null;
  author: HTMLInputElement | null;
}

export const emptyStoryInputs = (): StoryInputs => ({
  rows: Array.from({ length: RESULT_ROWS }, () => ({ label: null, value: null })),
  quote: null,
  author: null,
});

export interface ClientResultsFieldsProps {
  baseId: string;
  limits: Pick<ClientLimits, "resultLabelMax" | "resultValueMax" | "testimonialQuoteMax" | "testimonialAuthorMax">;
  rows: readonly ResultRow[];
  quote: string;
  author: string;
  onRowChange: (index: number, part: keyof ResultRow, text: string) => void;
  onQuoteChange: (text: string) => void;
  onAuthorChange: (text: string) => void;
  /** A Risultati input lost focus: the results save now. */
  onResultsBlur: () => void;
  /** A Testimonial input lost focus: the testimonial saves now. */
  onTestimonialBlur: () => void;
  /** Focus left a row or the testimonial: its incomplete message may show from now on. */
  onLeave: (key: IncompleteKey) => void;
  /** The incomplete messages already revealed (focus left, or a save was attempted). */
  revealed: ReadonlySet<IncompleteKey>;
  resultsFailed: boolean;
  testimonialFailed: boolean;
  inputs: RefObject<StoryInputs>;
}

/**
 * Risultati and Testimonial in the Racconto card (owner, 2026-10-22), both optional.
 * Risultati: 3 rows of label (wide) + value (narrow); a row counts only when both are
 * filled. Testimonial: a quote and its author; an author needs a quote. The panel
 * owns the values and their autosave; this renders them and their messages.
 */
export function ClientResultsFields({
  baseId,
  limits,
  rows,
  quote,
  author,
  onRowChange,
  onQuoteChange,
  onAuthorChange,
  onResultsBlur,
  onTestimonialBlur,
  onLeave,
  revealed,
  resultsFailed,
  testimonialFailed,
  inputs,
}: ClientResultsFieldsProps) {
  const ids = {
    results: `${baseId}-results`,
    resultsHint: `${baseId}-results-hint`,
    resultsError: `${baseId}-results-error`,
    testimonial: `${baseId}-testimonial`,
    testimonialHint: `${baseId}-testimonial-hint`,
    testimonialError: `${baseId}-testimonial-error`,
    quoteError: `${baseId}-quote-error`,
    authorError: `${baseId}-author-error`,
  };
  const describedBy = (...list: (string | false)[]) => list.filter(Boolean).join(" ") || undefined;
  /** Focus moved outside the row or group: `onLeave(key)`. */
  const leaving = (key: IncompleteKey) => (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onLeave(key);
  };

  const quoteOver = isOver(quote, limits.testimonialQuoteMax);
  const authorOver = isOver(author, limits.testimonialAuthorMax);
  const missingQuote = isAuthorOnly(quote, author) && revealed.has("testimonial");
  const quoteMessage = quoteOver ? fill(it.clients.errors.fieldTooLong, { max: limits.testimonialQuoteMax }) : missingQuote ? copy.testimonial.missingQuote : null;
  const authorMessage = authorOver ? fill(it.clients.errors.fieldTooLong, { max: limits.testimonialAuthorMax }) : null;

  return (
    <>
      <div role="group" aria-labelledby={ids.results} aria-describedby={describedBy(ids.resultsHint, resultsFailed && ids.resultsError)} className="mt-2 flex flex-col gap-2">
        <span id={ids.results} className={FIELD_LABEL}>
          {copy.results.title}
        </span>
        {rows.map((row, index) => {
          const key: IncompleteKey = `row-${index}`;
          const labelOver = isOver(row.label, limits.resultLabelMax);
          const valueOver = isOver(row.value, limits.resultValueMax);
          const half = isHalfRow(row) && revealed.has(key);
          const message = labelOver
            ? fill(it.clients.errors.fieldTooLong, { max: limits.resultLabelMax })
            : valueOver
              ? fill(it.clients.errors.fieldTooLong, { max: limits.resultValueMax })
              : half
                ? copy.results.halfRow
                : null;
          const errorId = `${ids.results}-${index}-error`;
          const placeholder = copy.results.placeholders[index];
          // The empty part of a half row is the one to fill.
          const labelInvalid = labelOver || (half && row.label.trim() === "");
          const valueInvalid = valueOver || (half && row.value.trim() === "");
          return (
            <div key={key} onBlur={leaving(key)} className="flex flex-col gap-1.5">
              <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] gap-2">
                <input
                  ref={(element) => {
                    const slot = inputs.current.rows[index];
                    if (slot) slot.label = element;
                  }}
                  type="text"
                  autoComplete="off"
                  name={`results.${index}.label`}
                  aria-label={fill(copy.results.labelName, { n: index + 1 })}
                  aria-invalid={labelInvalid || undefined}
                  aria-describedby={message === null ? undefined : errorId}
                  placeholder={placeholder?.label}
                  value={row.label}
                  onChange={(event) => onRowChange(index, "label", event.target.value)}
                  onBlur={onResultsBlur}
                  className={FIELD}
                />
                <input
                  ref={(element) => {
                    const slot = inputs.current.rows[index];
                    if (slot) slot.value = element;
                  }}
                  type="text"
                  autoComplete="off"
                  name={`results.${index}.value`}
                  aria-label={fill(copy.results.valueName, { n: index + 1 })}
                  aria-invalid={valueInvalid || undefined}
                  aria-describedby={message === null ? undefined : errorId}
                  placeholder={placeholder?.value}
                  value={row.value}
                  onChange={(event) => onRowChange(index, "value", event.target.value)}
                  onBlur={onResultsBlur}
                  className={cn(FIELD, "tabular-nums")}
                />
              </div>
              {message !== null && (
                <p id={errorId} className={ERROR}>
                  {message}
                </p>
              )}
            </div>
          );
        })}
        <p id={ids.resultsHint} className={FIELD_HINT}>
          {copy.results.hint}
        </p>
        {resultsFailed && (
          <p id={ids.resultsError} className={ERROR}>
            {copy.errors.saveFailed}
          </p>
        )}
      </div>

      <div
        role="group"
        aria-labelledby={ids.testimonial}
        aria-describedby={describedBy(ids.testimonialHint, testimonialFailed && ids.testimonialError)}
        onBlur={leaving("testimonial")}
        className="mt-2 flex flex-col gap-2"
      >
        <span id={ids.testimonial} className={FIELD_LABEL}>
          {copy.testimonial.title}
        </span>
        <textarea
          ref={(element) => {
            inputs.current.quote = element;
          }}
          name="testimonialQuote"
          rows={3}
          aria-label={copy.testimonial.quoteName}
          aria-invalid={quoteOver || missingQuote || undefined}
          aria-describedby={quoteMessage === null ? undefined : ids.quoteError}
          placeholder={copy.testimonial.quotePlaceholder}
          value={quote}
          onChange={(event) => onQuoteChange(event.target.value)}
          onBlur={onTestimonialBlur}
          className={TEXTAREA}
        />
        {quoteMessage !== null && (
          <p id={ids.quoteError} className={ERROR}>
            {quoteMessage}
          </p>
        )}
        <input
          ref={(element) => {
            inputs.current.author = element;
          }}
          type="text"
          autoComplete="off"
          name="testimonialAuthor"
          aria-label={copy.testimonial.authorName}
          aria-invalid={authorOver || undefined}
          aria-describedby={authorMessage === null ? undefined : ids.authorError}
          placeholder={copy.testimonial.authorPlaceholder}
          value={author}
          onChange={(event) => onAuthorChange(event.target.value)}
          onBlur={onTestimonialBlur}
          className={FIELD}
        />
        {authorMessage !== null && (
          <p id={ids.authorError} className={ERROR}>
            {authorMessage}
          </p>
        )}
        <p id={ids.testimonialHint} className={FIELD_HINT}>
          {copy.testimonial.hint}
        </p>
        {testimonialFailed && (
          <p id={ids.testimonialError} className={ERROR}>
            {copy.errors.saveFailed}
          </p>
        )}
      </div>
    </>
  );
}
