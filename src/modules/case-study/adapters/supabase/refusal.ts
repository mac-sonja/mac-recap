import type { AppError } from "@/shared/result";

/** Postgres raise_exception: the case-study SQL functions raise it with a refusal code as the message. */
export const RAISE_EXCEPTION = "P0001";

export type Refusals = Readonly<Record<string, Omit<AppError, "details">>>;

/** The refusal a Postgres function raised as P0001 with one of `refusals`' messages, if any. */
export function refusalOf(error: { code: string; message: string }, refusals: Refusals): Omit<AppError, "details"> | undefined {
  return error.code === RAISE_EXCEPTION && Object.hasOwn(refusals, error.message) ? refusals[error.message] : undefined;
}
