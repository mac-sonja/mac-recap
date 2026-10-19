import type { z } from "zod";
import { err, type AppError, type Result } from "@/shared/result";

export interface FieldIssue {
  field: string;
  message: string;
}

/** Parses `input` with `schema`; on failure an `INVALID_INPUT` naming each failing field. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): Result<z.infer<S>, AppError> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true, value: parsed.data };
  const issues: FieldIssue[] = parsed.error.issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.map(String).join(".") : "(input)",
    message: issue.message,
  }));
  const fields = [...new Set(issues.map((i) => i.field))];
  return err({
    code: "INVALID_INPUT",
    message: `Invalid or missing: ${fields.join(", ")}.`,
    details: { fields, issues },
  });
}

/**
 * The client fields whose errors are `CLIENT_FIELD_TOO_LONG` (over the limit) or
 * `CLIENT_FIELD_INVALID` (missing or outside the allowed values).
 */
const INFO_FIELDS = new Set(["industries", "description", "logoId", "text"]);

/**
 * `parseInput` for the client inputs (add, edit, brief save): when every failure is
 * on an info field (industries, description, logo, brief text) with the
 * `invalidMessage` or `tooLongMessage`, the error is `CLIENT_FIELD_INVALID` (if any
 * field is missing or invalid) or `CLIENT_FIELD_TOO_LONG`, naming those fields by
 * their top-level key. Any other failure (a blank name, a malformed id) stays `INVALID_INPUT`.
 */
export function parseClientInput<S extends z.ZodType>(
  schema: S,
  input: unknown,
  messages: { tooLong: string; invalid: string },
): Result<z.infer<S>, AppError> {
  const parsed = parseInput(schema, input);
  if (parsed.ok) return parsed;
  const { issues } = parsed.error.details as { issues: FieldIssue[]; fields: string[] };
  const topField = (issue: FieldIssue) => issue.field.split(".")[0];
  const onInfo = issues.every(
    (issue) => INFO_FIELDS.has(topField(issue)) && (issue.message === messages.tooLong || issue.message === messages.invalid),
  );
  if (!onInfo) return parsed;
  const fields = [...new Set(issues.map(topField))];
  if (issues.some((issue) => issue.message === messages.invalid)) {
    return err({ code: "CLIENT_FIELD_INVALID", message: `Missing or invalid: ${fields.join(", ")}.`, details: { fields } });
  }
  return err({ code: "CLIENT_FIELD_TOO_LONG", message: `Too long: ${fields.join(", ")}.`, details: { fields } });
}
