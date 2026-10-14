import { z } from "zod";
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

/** At most `max` characters counted as code points (like Postgres `char_length`); cheap when the UTF-16 length is already within it. */
export function withinCodePoints(value: string, max: number): boolean {
  if (value.length <= max) return true;
  if (value.length > max * 2) return false;
  return Array.from(value).length <= max;
}

/** Postgres text cannot hold U+0000. */
export const hasNoNul = (value: string) => !value.includes("\u0000");
export const NUL_MESSAGE = "Must not contain the NUL character.";

/** The case whose material is checked by `hasMaterial`. */
export const caseIdSchema = z.uuid();
