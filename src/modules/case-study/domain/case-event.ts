import { z } from "zod";

/** The event written with every new case, in the same transaction. */
export const CASE_CREATED = "case_created";

/**
 * The event written with every soft delete, in the same transaction. For each case of
 * a deleted client (owner, 2026-10-19) `data` is `{ reason: "client_deleted", clientId,
 * clientCode, code, status }`; for a deleted draft (Story 4.1) it is `{ reason:
 * "draft_deleted", clientId, code, status }`.
 */
export const CASE_DELETED = "case_deleted";

/**
 * The event written when a draft's name, client, year, language or business lines change
 * (Story 2.17; client and multi-select 2026-10-21), in the same transaction; `data` is
 * `{ name, clientId, year, locale, businessLines }`, plus `previousClientId` on a client
 * change and `{ previousYear, previousCode, code }` when the draft was renumbered.
 */
export const CASE_DETAILS_UPDATED = "case_details_updated";

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
