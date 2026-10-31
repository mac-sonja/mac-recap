import { httpStatusFor } from "@/modules/access";
import type { AppError } from "@/shared/result";

/**
 * What a server action returns to the client: the value, or the HTTP-style
 * status with `{ error: { code, message } }`. `details` stays server-side;
 * only an `INVALID_INPUT`, `CLIENT_FIELD_INVALID` or `CLIENT_FIELD_TOO_LONG` adds the names of the failing fields,
 * a `CLIENT_LOGO_INVALID` for an SVG that failed the safety scan adds `reason: "unsafe_svg"`,
 * and an `ASSET_NOT_ALLOWED` adds the refused `assetIds` (the configurator names those files).
 */
export type ActionResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; error: { code: string; message: string; fields?: string[]; reason?: "unsafe_svg"; assetIds?: string[] } };

/** The codes whose `details.fields` reach the client. */
const FIELD_CODES = new Set(["INVALID_INPUT", "CLIENT_FIELD_INVALID", "CLIENT_FIELD_TOO_LONG"]);

/**
 * The client-facing failure for an `AppError`. Lives outside the "use server"
 * action files, which may export only async functions.
 */
export function failure(error: AppError): ActionResult<never> {
  const { code, message } = error;
  const fields =
    FIELD_CODES.has(code) && error.details && typeof error.details === "object" && "fields" in error.details
      ? (error.details as { fields: string[] }).fields
      : undefined;
  const unsafeSvg =
    code === "CLIENT_LOGO_INVALID" &&
    typeof error.details === "object" &&
    error.details !== null &&
    (error.details as { reason?: unknown }).reason === "unsafe_svg";
  const refused = code === "ASSET_NOT_ALLOWED" && typeof error.details === "object" && error.details !== null ? (error.details as { assetIds?: unknown }).assetIds : undefined;
  const assetIds = Array.isArray(refused) ? refused.filter((id): id is string => typeof id === "string") : undefined;
  return {
    ok: false,
    status: httpStatusFor(error),
    error: {
      code,
      message,
      ...(fields ? { fields } : {}),
      ...(unsafeSvg ? { reason: "unsafe_svg" as const } : {}),
      ...(assetIds ? { assetIds } : {}),
    },
  };
}
