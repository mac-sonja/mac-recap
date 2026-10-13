import { assetSchema, type Asset } from "@/modules/material/domain/asset";
import type { AssetRepository } from "@/modules/material/ports/asset-repository";
import { assetKey } from "@/modules/material/adapters/asset-key";
import type { Tables } from "@/shared/db.types";
import { log } from "@/shared/log";
import { err, ok, type AppError, type Result } from "@/shared/result";
import { createSupabaseAdminClient } from "./admin";

type AssetRow = Tables<"asset">;

/** Postgres raise_exception: `create_asset` / `restore_asset` raise it with one of these messages. */
const RAISE_EXCEPTION = "P0001";
/** Postgres unique_violation: fallback if the id (or its key) exists despite the function's check. */
const UNIQUE_VIOLATION = "23505";

/** The columns `toAsset` maps; the S3 key is rebuilt by `assetKey` when needed, so it isn't read. */
const ASSET_COLUMNS = "id, case_id, kind, original_file_name, content_type, size_bytes, created_by, created_at, deleted_at";

const REFUSALS: Readonly<Record<string, Omit<AppError, "details">>> = {
  NOT_FOUND: { code: "NOT_FOUND", message: "No such case study or file." },
  FILE_LIMIT_REACHED: { code: "FILE_LIMIT_REACHED", message: "This case study already has 20 files." },
  ASSET_ALREADY_CONFIRMED: { code: "ASSET_ALREADY_CONFIRMED", message: "This upload was already confirmed." },
};

const refusal = (error: { code: string; message: string }) =>
  error.code === RAISE_EXCEPTION && Object.hasOwn(REFUSALS, error.message) ? REFUSALS[error.message] : undefined;

/** Maps an `asset` row to the domain shape, rejecting values outside the domain. */
export function toAsset(row: AssetRow): Result<Asset> {
  const parsed = assetSchema.safeParse({
    id: row.id,
    caseId: row.case_id,
    kind: row.kind,
    originalFileName: row.original_file_name,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  });
  if (!parsed.success) {
    return err({ code: "ASSET_INVALID", message: "An asset row failed validation.", details: { id: row.id } });
  }
  return ok(parsed.data);
}

export function createSupabaseAssetRepository(
  client: () => ReturnType<typeof createSupabaseAdminClient> = createSupabaseAdminClient,
): AssetRepository {
  return {
    async listLive(caseId) {
      const { data, error } = await client()
        .from("asset")
        .select(ASSET_COLUMNS)
        .eq("case_id", caseId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      if (error) {
        log.error(`asset list failed: ${error.code ?? "no-code"}`, { caseId });
        return err({ code: "ASSET_LOOKUP_FAILED", message: "Could not read the case study's files." });
      }
      const assets: Asset[] = [];
      for (const row of data) {
        const mapped = toAsset(row as AssetRow);
        if (!mapped.ok) return mapped;
        assets.push(mapped.value);
      }
      return ok(assets);
    },

    async countLive(caseId) {
      const { count, error } = await client()
        .from("asset")
        .select("id", { count: "exact", head: true })
        .eq("case_id", caseId)
        .is("deleted_at", null);
      if (error || count === null) {
        log.error(`asset count failed: ${error?.code ?? "no count returned"}`, { caseId });
        return err({ code: "ASSET_LOOKUP_FAILED", message: "Could not read the case study's files." });
      }
      return ok(count);
    },

    async create(asset) {
      // One Postgres function locks the case, re-checks the cap and inserts.
      const { data, error } = await client().rpc("create_asset", {
        p_id: asset.id,
        p_case_id: asset.caseId,
        p_kind: asset.kind,
        p_original_file_name: asset.originalFileName,
        p_content_type: asset.contentType,
        p_size_bytes: asset.sizeBytes,
        p_s3_key: assetKey(asset.caseId, asset.id, asset.contentType),
        p_actor_id: asset.createdBy,
      });
      if (error) {
        const refused = refusal(error);
        if (refused) return err({ ...refused, details: { caseId: asset.caseId, assetId: asset.id } });
        if (error.code === UNIQUE_VIOLATION) {
          return err({
            code: "ASSET_ALREADY_CONFIRMED",
            message: "This upload was already confirmed.",
            details: { caseId: asset.caseId, assetId: asset.id },
          });
        }
        log.error(`asset create failed: ${error.code}`, { caseId: asset.caseId, actorId: asset.createdBy });
        return err({ code: "ASSET_WRITE_FAILED", message: "Could not save the file." });
      }
      if (data === null) {
        log.error("asset create failed: no row returned", { caseId: asset.caseId, actorId: asset.createdBy });
        return err({ code: "ASSET_WRITE_FAILED", message: "Could not save the file." });
      }
      return toAsset(data as AssetRow);
    },

    async softDelete(caseId, assetId) {
      const { data, error } = await client()
        .from("asset")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", assetId)
        .eq("case_id", caseId)
        .is("deleted_at", null)
        .select("id");
      if (error) {
        log.error(`asset soft delete failed: ${error.code}`, { caseId });
        return err({ code: "ASSET_WRITE_FAILED", message: "Could not remove the file." });
      }
      return ok(data.length > 0);
    },

    async restore(caseId, assetId) {
      const { data, error } = await client().rpc("restore_asset", { p_case_id: caseId, p_asset_id: assetId });
      if (error) {
        const refused = refusal(error);
        if (refused) return err({ ...refused, details: { caseId, assetId } });
        log.error(`asset restore failed: ${error.code}`, { caseId });
        return err({ code: "ASSET_WRITE_FAILED", message: "Could not restore the file." });
      }
      return ok(data === true);
    },
  };
}
