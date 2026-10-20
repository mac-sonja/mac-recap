import { renditionSchema, type Rendition } from "@/modules/material/domain/rendition";
import type { RenditionRepository } from "@/modules/material/ports/rendition-repository";
import type { Tables } from "@/shared/db.types";
import { log } from "@/shared/log";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseAdminClient } from "./admin";

type RenditionRow = Tables<"rendition">;

const RENDITION_COLUMNS = "asset_id, spec_hash, path, content_type, width, height, size_bytes, created_at";

/** Postgres raise_exception: `upsert_rendition` raises it with `NOT_FOUND` or `RENDITION_PATH_INVALID`. */
const RAISE_EXCEPTION = "P0001";

/** Maps a `rendition` row to the domain shape, rejecting values outside the domain. */
export function toRendition(row: RenditionRow): Result<Rendition> {
  const parsed = renditionSchema.safeParse({
    assetId: row.asset_id,
    specHash: row.spec_hash,
    path: row.path,
    contentType: row.content_type,
    width: row.width,
    height: row.height,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
  });
  if (!parsed.success) {
    return err({ code: "RENDITION_INVALID", message: "A rendition row failed validation.", details: { assetId: row.asset_id } });
  }
  return ok(parsed.data);
}

function mapRows(rows: RenditionRow[]): Result<Rendition[]> {
  const out: Rendition[] = [];
  for (const row of rows) {
    const mapped = toRendition(row);
    if (!mapped.ok) return mapped;
    out.push(mapped.value);
  }
  return ok(out);
}

const lookupFailed = () => err({ code: "RENDITION_LOOKUP_FAILED", message: "Could not read the file's display copies." });

/** Supabase adapter for `rendition` (service role; writes only through `upsert_rendition`). */
export function createSupabaseRenditionRepository(
  client: () => ReturnType<typeof createSupabaseAdminClient> = createSupabaseAdminClient,
): RenditionRepository {
  return {
    async listForAsset(assetId) {
      const { data, error } = await client().from("rendition").select(RENDITION_COLUMNS).eq("asset_id", assetId);
      if (error) {
        log.error(`rendition list failed: ${error.code ?? "no-code"}`);
        return lookupFailed();
      }
      return mapRows(data as RenditionRow[]);
    },

    async listFor(assetIds, specHashes) {
      if (assetIds.length === 0 || specHashes.length === 0) return ok([]);
      const { data, error } = await client()
        .from("rendition")
        .select(RENDITION_COLUMNS)
        .in("asset_id", [...assetIds])
        .in("spec_hash", [...specHashes]);
      if (error) {
        log.error(`rendition list failed: ${error.code ?? "no-code"}`);
        return lookupFailed();
      }
      return mapRows(data as RenditionRow[]);
    },

    async get(assetId, specHash) {
      const { data, error } = await client()
        .from("rendition")
        .select(RENDITION_COLUMNS)
        .eq("asset_id", assetId)
        .eq("spec_hash", specHash)
        .maybeSingle();
      if (error) {
        log.error(`rendition get failed: ${error.code ?? "no-code"}`);
        return lookupFailed();
      }
      if (data === null) return ok(null);
      return toRendition(data as RenditionRow);
    },

    async upsert(rendition) {
      const { data, error } = await client().rpc("upsert_rendition", {
        p_asset_id: rendition.assetId,
        p_spec_hash: rendition.specHash,
        p_path: rendition.path,
        p_content_type: rendition.contentType,
        p_width: rendition.width,
        p_height: rendition.height,
        p_size_bytes: rendition.sizeBytes,
      });
      if (error || data === null) {
        const refused = error?.code === RAISE_EXCEPTION ? error.message : undefined;
        log.error(`rendition upsert failed: ${refused ?? error?.code ?? "no row returned"}`);
        return err({ code: refused === "NOT_FOUND" ? "NOT_FOUND" : "RENDITION_WRITE_FAILED", message: "Could not record the display copy." });
      }
      return toRendition(data as RenditionRow);
    },
  };
}
