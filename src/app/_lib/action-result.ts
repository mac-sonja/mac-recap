import { httpStatusFor } from "@/modules/access";
import type { AppError } from "@/shared/result";

/**
 * What a server action returns to the client: the value, or the HTTP-style
 * status with `{ error: { code, message } }`. `details` stays server-side;
 * only an `INVALID_INPUT` or `CLIENT_FIELD_TOO_LONG` adds the names of the failing fields.
 */
export type ActionResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; error: { code: string; message: string; fields?: string[] } };

/**
 * The client-facing failure for an `AppError`. Lives outside the "use server"
 * action files, which may export only async functions.
 */
export function failure(error: AppError): ActionResult<never> {
  const { code, message } = error;
  const fields =
    (code === "INVALID_INPUT" || code === "CLIENT_FIELD_TOO_LONG") && error.details && typeof error.details === "object" && "fields" in error.details
      ? (error.details as { fields: string[] }).fields
      : undefined;
  return { ok: false, status: httpStatusFor(error), error: fields ? { code, message, fields } : { code, message } };
}
