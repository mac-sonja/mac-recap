import { z } from "zod";

/** The event written with every new case, in the same transaction. */
export const CASE_CREATED = "case_created";

/** The event written with every status change, in the same transaction; `data` is `{ event, from, to }`. */
export const TRANSITION = "transition";

/** Event types are snake_case; the `case_event.type` check uses the same pattern. */
export const caseEventTypeSchema = z.string().regex(/^[a-z][a-z0-9_]*$/, "Must be snake_case.");

const eventDataSchema = z.record(z.string(), z.json());

/** A `case_event` row: append-only, one per mutation, always with its actor. */
export const caseEventSchema = z.object({
  id: z.uuid(),
  caseId: z.uuid(),
  revisionId: z.uuid().nullable(),
  actorId: z.uuid(),
  type: caseEventTypeSchema,
  at: z.string(),
  data: eventDataSchema,
});
export type CaseEvent = z.infer<typeof caseEventSchema>;

/** What a caller supplies to record an event; the actor comes from the request. */
export const recordEventInputSchema = z.object({
  caseId: z.uuid(),
  type: caseEventTypeSchema,
  revisionId: z.uuid().nullable().default(null),
  data: eventDataSchema.default({}),
});
export type RecordEventInput = z.infer<typeof recordEventInputSchema>;
