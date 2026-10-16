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
