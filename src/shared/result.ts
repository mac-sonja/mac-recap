/** Error codes are SCREAMING_SNAKE, e.g. `NO_MATERIAL`, `FORBIDDEN`. */
export type ErrorCode = Uppercase<string>;

export interface AppError {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

export type Result<T, E extends AppError = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E extends AppError>(error: E): Result<never, E> {
  return { ok: false, error };
}
