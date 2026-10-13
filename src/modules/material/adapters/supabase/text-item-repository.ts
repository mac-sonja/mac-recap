import { textEmpty, textItemSchema, type TextItem } from "@/modules/material/domain/text-item";
import type { TextItemRepository } from "@/modules/material/ports/text-item-repository";
import type { Tables } from "@/shared/db.types";
import { log } from "@/shared/log";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseAdminClient } from "./admin";

type TextItemRow = Tables<"text_item">;

/** Postgres check_violation; with `text_item_body_check` it means a whitespace-only body. */
const CHECK_VIOLATION = "23514";
/** Postgres foreign_key_violation: the case id does not exist. */
const FOREIGN_KEY_VIOLATION = "23503";

const COLUMNS = "id, case_id, title, body, created_by, created_at, updated_at, deleted_at";

const isEmptyBodyRefusal = (error: { code: string; message: string }) =>
  error.code === CHECK_VIOLATION && error.message.includes("text_item_body_check");

/** Maps a `text_item` row to the domain shape, rejecting values outside the domain. */
export function toTextItem(row: TextItemRow): Result<TextItem> {
  const parsed = textItemSchema.safeParse({
    id: row.id,
    caseId: row.case_id,
    title: row.title,
    body: row.body,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  });
  if (!parsed.success) {
    return err({ code: "TEXT_ITEM_INVALID", message: "A text item row failed validation.", details: { id: row.id } });
  }
  return ok(parsed.data);
}

const writeFailed = (message: string) => err({ code: "TEXT_WRITE_FAILED", message });

/** Never logs the title or body: only the Postgres error code and correlation ids. */
export function createSupabaseTextItemRepository(
  client: () => ReturnType<typeof createSupabaseAdminClient> = createSupabaseAdminClient,
): TextItemRepository {
  return {
    async create(item) {
      const { data, error } = await client()
        .from("text_item")
        .insert({ case_id: item.caseId, title: item.title, body: item.body, created_by: item.createdBy })
        .select(COLUMNS)
        .single();
      if (error) {
        if (isEmptyBodyRefusal(error)) return err(textEmpty());
        if (error.code === FOREIGN_KEY_VIOLATION && error.message.includes("text_item_case_id_fkey")) {
          return err({ code: "NOT_FOUND", message: "No such case study.", details: { caseId: item.caseId } });
        }
        log.error(`text item create failed: ${error.code}`, { caseId: item.caseId, actorId: item.createdBy });
        return writeFailed("Could not save the text.");
      }
      return toTextItem(data as TextItemRow);
    },

    async getLive(caseId, textItemId) {
      const { data, error } = await client()
        .from("text_item")
        .select(COLUMNS)
        .eq("id", textItemId)
        .eq("case_id", caseId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) {
        log.error(`text item lookup failed: ${error.code}`, { caseId });
        return err({ code: "TEXT_LOOKUP_FAILED", message: "Could not read the text." });
      }
      return data === null ? ok(null) : toTextItem(data as TextItemRow);
    },

    async update(caseId, textItemId, content) {
      const { data, error } = await client()
        .from("text_item")
        .update({ title: content.title, body: content.body })
        .eq("id", textItemId)
        .eq("case_id", caseId)
        .is("deleted_at", null)
        .select(COLUMNS)
        .maybeSingle();
      if (error) {
        if (isEmptyBodyRefusal(error)) return err(textEmpty());
        log.error(`text item update failed: ${error.code}`, { caseId });
        return writeFailed("Could not save the text.");
      }
      return data === null ? ok(null) : toTextItem(data as TextItemRow);
    },

    async softDelete(caseId, textItemId) {
      const { data, error } = await client()
        .from("text_item")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", textItemId)
        .eq("case_id", caseId)
        .is("deleted_at", null)
        .select("id");
      if (error) {
        log.error(`text item soft delete failed: ${error.code}`, { caseId });
        return writeFailed("Could not remove the text.");
      }
      return ok(data.length > 0);
    },

    async restore(caseId, textItemId) {
      const db = client();
      const { data, error } = await db
        .from("text_item")
        .update({ deleted_at: null })
        .eq("id", textItemId)
        .eq("case_id", caseId)
        .not("deleted_at", "is", null)
        .select("id");
      if (error) {
        log.error(`text item restore failed: ${error.code}`, { caseId });
        return writeFailed("Could not restore the text.");
      }
      if (data.length > 0) return ok(true);

      const { data: existing, error: lookupError } = await db
        .from("text_item")
        .select("id")
        .eq("id", textItemId)
        .eq("case_id", caseId)
        .maybeSingle();
      if (lookupError) {
        log.error(`text item lookup failed: ${lookupError.code}`, { caseId });
        return err({ code: "TEXT_LOOKUP_FAILED", message: "Could not read the text." });
      }
      if (existing === null) {
        return err({ code: "NOT_FOUND", message: "No such text.", details: { caseId, textItemId } });
      }
      return ok(false);
    },

    async hasMaterial(caseId) {
      const { data, error } = await client().rpc("has_material", { p_case_id: caseId });
      if (error) {
        log.error(`has_material failed: ${error.code}`, { caseId });
        return err({ code: "MATERIAL_LOOKUP_FAILED", message: "Could not check the case study's material." });
      }
      return ok(data === true);
    },
  };
}
