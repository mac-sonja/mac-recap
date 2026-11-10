import type { CollectionTags, StoredCollection } from "@/modules/collection/domain/collection";
import type { CollectionRepository } from "@/modules/collection/ports/collection-repository";
import { log } from "@/shared/log";
import { err, ok, type AppError, type Result } from "@/shared/result";
import { createSupabaseAdminClient } from "./admin";

/** Postgres raise_exception: the collection SQL functions raise it with a refusal code as the message. */
const RAISE_EXCEPTION = "P0001";

/** What the writers raise as P0001; nothing is written then. */
const REFUSALS: Readonly<Record<string, Omit<AppError, "details">>> = {
  INVALID_INPUT: { code: "INVALID_INPUT", message: "Invalid collection input." },
  COLLECTION_NOT_FOUND: { code: "COLLECTION_NOT_FOUND", message: "No collection with this id." },
  STALE_COLLECTION: { code: "STALE_COLLECTION", message: "The collection changed meanwhile." },
  CASE_NOT_COLLECTABLE: { code: "CASE_NOT_COLLECTABLE", message: "Only approved, non-deleted cases can be added to a collection." },
};

/** The refusal behind a write error, with the failing field when the function named it; null for any other failure. */
function refusalOf(error: { code: string; message: string; details?: string | null }): AppError | null {
  if (error.code !== RAISE_EXCEPTION || !Object.hasOwn(REFUSALS, error.message)) return null;
  const refusal = REFUSALS[error.message]!;
  if (refusal.code !== "INVALID_INPUT") return { ...refusal };
  const field = error.details === "tags" ? ["businessLines", "industries"] : error.details === "name" ? ["name"] : ["caseIds"];
  return { ...refusal, details: { fields: field } };
}

const COLUMNS =
  "id, name, version, created_at, updated_at, created_by, creator:profile!collection_created_by_fkey(display_name, role), items:collection_item(case_id, position), tags:collection_tag(kind, key)";

interface Row {
  id: string;
  name: string;
  version: number;
  created_at: string;
  updated_at: string;
  created_by: string;
  creator: { display_name: string; role: string } | null;
  items: { case_id: string; position: number }[] | null;
  tags: { kind: string; key: string }[] | null;
}

function toCollection(row: Row): StoredCollection {
  const items = [...(row.items ?? [])].sort((a, b) => a.position - b.position);
  const tags: CollectionTags = { businessLines: [], industries: [] };
  for (const tag of row.tags ?? []) (tag.kind === "business_line" ? tags.businessLines : tags.industries).push(tag.key);
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    tags,
    caseIds: items.map((i) => i.case_id),
    createdBy: { id: row.created_by, name: row.creator === null || row.creator.role === "system" ? null : row.creator.display_name },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const writeFailed = (what: string, details: Record<string, unknown>): AppError => ({
  code: "COLLECTION_WRITE_FAILED",
  message: `Could not ${what}.`,
  details,
});

export function createSupabaseCollectionRepository(
  client: () => ReturnType<typeof createSupabaseAdminClient> = createSupabaseAdminClient,
): CollectionRepository {
  /** A writer's call: its value, or its refusal, or a logged failure. */
  async function write<T>(what: string, call: PromiseLike<{ data: unknown; error: { code: string; message: string; details?: string | null } | null }>, details: Record<string, unknown>, parse: (data: unknown) => T | null): Promise<Result<T>> {
    const { data, error } = await call;
    if (error) {
      const refused = refusalOf(error);
      if (refused) return err({ ...refused, ...(refused.details === undefined ? { details } : {}) });
      log.error(`collection ${what} failed: ${error.code}`, details);
      return err(writeFailed(what, details));
    }
    const value = parse(data);
    if (value === null) {
      log.error(`collection ${what} failed: unexpected result`, details);
      return err(writeFailed(what, details));
    }
    return ok(value);
  }
  const versionOf = (data: unknown) => (typeof data === "number" && Number.isInteger(data) ? data : null);

  return {
    async list() {
      const { data, error } = await client()
        .from("collection")
        .select(COLUMNS)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .order("id", { ascending: true });
      if (error) {
        log.error(`collection list failed: ${error.code}`);
        return err({ code: "COLLECTION_LOOKUP_FAILED", message: "Could not list the collections." });
      }
      return ok((data as unknown as Row[]).map(toCollection));
    },

    async find(id) {
      const { data, error } = await client().from("collection").select(COLUMNS).eq("id", id).is("deleted_at", null).maybeSingle();
      if (error) {
        log.error(`collection lookup failed: ${error.code}`, { collectionId: id });
        return err({ code: "COLLECTION_LOOKUP_FAILED", message: "Could not read the collection.", details: { collectionId: id } });
      }
      return ok(data === null ? null : toCollection(data as unknown as Row));
    },

    create(input, actorId) {
      return write(
        "create",
        client().rpc("create_collection", {
          p_name: input.name,
          p_business_lines: [...input.tags.businessLines],
          p_industries: [...input.tags.industries],
          p_case_ids: [...input.caseIds],
          p_actor_id: actorId,
        }),
        { actorId },
        (data) => {
          const value = data as { id?: unknown; version?: unknown } | null;
          return value !== null && typeof value.id === "string" && typeof value.version === "number" ? { id: value.id, version: value.version } : null;
        },
      );
    },

    setItems(id, expectedVersion, caseIds, actorId, event) {
      return write(
        "items save",
        client().rpc("set_collection_items", {
          p_collection_id: id,
          p_expected_version: expectedVersion,
          p_case_ids: [...caseIds],
          p_actor_id: actorId,
          p_event_type: event.type,
          p_event_data: event.data as never,
        }),
        { collectionId: id },
        versionOf,
      );
    },

    rename(id, expectedVersion, name, actorId) {
      return write(
        "rename",
        client().rpc("rename_collection", { p_collection_id: id, p_expected_version: expectedVersion, p_name: name, p_actor_id: actorId }),
        { collectionId: id },
        versionOf,
      );
    },

    setTags(id, expectedVersion, tags, actorId) {
      return write(
        "tags save",
        client().rpc("set_collection_tags", {
          p_collection_id: id,
          p_expected_version: expectedVersion,
          p_business_lines: [...tags.businessLines],
          p_industries: [...tags.industries],
          p_actor_id: actorId,
        }),
        { collectionId: id },
        versionOf,
      );
    },

    async softDelete(id, actorId) {
      const done = await write("delete", client().rpc("delete_collection", { p_collection_id: id, p_actor_id: actorId }), { collectionId: id }, () => true);
      return done.ok ? ok(undefined) : done;
    },
  };
}
