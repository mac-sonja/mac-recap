import { exportRecordSchema, type ExportRecord } from "@/modules/rendering/domain/export";
import type { ExportRepository } from "@/modules/rendering/ports/export-repository";
import type { Tables } from "@/shared/db.types";
import { log } from "@/shared/log";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseAdminClient } from "./admin";

type ExportRow = Tables<"export">;

const COLUMNS = "id, content_hash, format, parts, path, content_type, size_bytes, created_by, created_at";

/** Postgres unique_violation: another worker wrote the same content hash first. */
const UNIQUE_VIOLATION = "23505";

/** Maps an `export` row to the domain shape, rejecting values outside the domain. */
export function toExportRecord(row: ExportRow): Result<ExportRecord> {
  const parsed = exportRecordSchema.safeParse({
    id: row.id,
    contentHash: row.content_hash,
    format: row.format,
    parts: row.parts,
    path: row.path,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    createdBy: row.created_by,
    createdAt: row.created_at,
  });
  if (!parsed.success) return err({ code: "EXPORT_INVALID", message: "An export row failed validation.", details: { exportId: row.id } });
  return ok(parsed.data);
}

const lookupFailed = () => err({ code: "EXPORT_LOOKUP_FAILED", message: "Could not read the exports." });

/** Supabase adapter for `export` (service role; insert and select only, as the grants allow). */
export function createSupabaseExportRepository(
  client: () => ReturnType<typeof createSupabaseAdminClient> = createSupabaseAdminClient,
): ExportRepository {
  let memo: ReturnType<typeof createSupabaseAdminClient> | undefined;
  const table = () => {
    memo ??= client();
    return memo.from("export");
  };

  async function findBy(column: "content_hash" | "id", value: string): Promise<Result<ExportRecord | null>> {
    try {
      const { data, error } = await table().select(COLUMNS).eq(column, value).maybeSingle();
      if (error) throw error;
      return data === null ? ok(null) : toExportRecord(data);
    } catch (error) {
      log.error(`export lookup failed: ${(error as { code?: string } | null)?.code ?? "unknown"}`);
      return lookupFailed();
    }
  }

  return {
    findByHash: (contentHash) => findBy("content_hash", contentHash),
    findById: (id) => findBy("id", id),
    async insert(row) {
      try {
        const { data, error } = await table()
          .insert({
            content_hash: row.contentHash,
            format: row.format,
            parts: row.parts,
            path: row.path,
            content_type: row.contentType,
            size_bytes: row.sizeBytes,
            created_by: row.createdBy,
          })
          .select(COLUMNS)
          .single();
        if (error) {
          if (error.code === UNIQUE_VIOLATION) {
            const existing = await findBy("content_hash", row.contentHash);
            if (!existing.ok) return existing;
            if (existing.value !== null) return ok(existing.value);
          }
          throw error;
        }
        return toExportRecord(data);
      } catch (error) {
        log.error(`export insert failed: ${(error as { code?: string } | null)?.code ?? "unknown"}`);
        return err({ code: "EXPORT_WRITE_FAILED", message: "Could not record the export." });
      }
    },
  };
}
