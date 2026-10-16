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

/** Sector and description: the fields whose length error is `CLIENT_FIELD_TOO_LONG`. */
const INFO_FIELDS = new Set(["sector", "description"]);

/**
 * `parseInput` for the client add and edit inputs: when the only failures are a
 * sector or description over its limit (`FIELD_TOO_LONG`), the error is
 * `CLIENT_FIELD_TOO_LONG` naming those fields; any other failure stays `INVALID_INPUT`.
 */
export function parseClientInput<S extends z.ZodType>(schema: S, input: unknown, tooLongMessage: string): Result<z.infer<S>, AppError> {
  const parsed = parseInput(schema, input);
  if (parsed.ok) return parsed;
  const { issues, fields } = parsed.error.details as { issues: FieldIssue[]; fields: string[] };
  const tooLong = issues.every((issue) => INFO_FIELDS.has(issue.field) && issue.message === tooLongMessage);
  if (!tooLong) return parsed;
  return err({
    code: "CLIENT_FIELD_TOO_LONG",
    message: `Too long: ${fields.join(", ")}.`,
    details: { fields },
  });
}
