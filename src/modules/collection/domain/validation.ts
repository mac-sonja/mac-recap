import type { z } from "zod";
import { err, type AppError, type Result } from "@/shared/result";

/** Parses `input` with `schema`; on failure an `INVALID_INPUT` naming each failing top-level field (`details.fields`). */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): Result<z.infer<S>, AppError> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true, value: parsed.data };
  const fields = [...new Set(parsed.error.issues.map((issue) => (issue.path.length > 0 ? String(issue.path[0]) : "(input)")))];
  return err({ code: "INVALID_INPUT", message: `Invalid or missing: ${fields.join(", ")}.`, details: { fields } });
}
