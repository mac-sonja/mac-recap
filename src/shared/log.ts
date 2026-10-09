/**
 * Structured JSON logger: one line per entry on stdout.
 * Context is limited to correlation ids; never log asset bytes, text material
 * or prompts.
 */
export interface LogContext {
  caseId?: string;
  jobId?: string;
  actorId?: string;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

function write(level: LogLevel, msg: string, context: LogContext = {}): void {
  const entry = { level, msg, time: new Date().toISOString(), ...pick(context) };
  process.stdout.write(`${JSON.stringify(entry)}\n`);
}

function pick({ caseId, jobId, actorId }: LogContext): LogContext {
  const out: LogContext = {};
  if (caseId !== undefined) out.caseId = caseId;
  if (jobId !== undefined) out.jobId = jobId;
  if (actorId !== undefined) out.actorId = actorId;
  return out;
}

export const log = {
  debug: (msg: string, context?: LogContext) => write("debug", msg, context),
  info: (msg: string, context?: LogContext) => write("info", msg, context),
  warn: (msg: string, context?: LogContext) => write("warn", msg, context),
  error: (msg: string, context?: LogContext) => write("error", msg, context),
};
