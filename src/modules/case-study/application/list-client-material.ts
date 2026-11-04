import {
  listClientMaterialInputSchema,
  type ClientAsset,
  type ListedClientAsset,
  type StoredClientAsset,
} from "@/modules/case-study/domain/client-material";
import { parseInput } from "@/modules/case-study/domain/validation";
import type { ClientRepository } from "@/modules/case-study/ports/client-repository";
import type { ClientMaterialStorage } from "@/modules/case-study/ports/client-material-storage";
import { log } from "@/shared/log";
import { err, ok, type Result } from "@/shared/result";
import { CLIENT_THUMBNAIL_TTL_SECONDS, clientNotFound } from "./client-material-deps";

/**
 * Lists `assets` with thumbnails: images get a signed GET of the original valid 15
 * minutes (scaled by the browser), all signed in one storage call; other kinds get
 * null. Signing never fails the listing: an image that could not be signed gets null
 * and a warning is logged (client id only).
 */
export async function withThumbnails(
  storage: ClientMaterialStorage,
  clientId: string,
  assets: readonly ClientAsset[],
): Promise<ListedClientAsset[]> {
  const images = assets.filter((asset) => asset.kind === "image");
  const urls = new Map<string, string | null>();
  if (images.length > 0) {
    const targets = images.map((asset) => ({ clientId, assetId: asset.id, contentType: asset.contentType }));
    const signed = await storage.presignDownloads(targets, CLIENT_THUMBNAIL_TTL_SECONDS);
    if (signed.ok) images.forEach((asset, i) => urls.set(asset.id, signed.value[i] ?? null));
    else log.warn(`client thumbnails not signed: ${signed.error.code}`, { clientId });
  }
  return assets.map((asset) => ({ ...asset, thumbnailUrl: urls.get(asset.id) ?? null }));
}

/**
 * The files of one client (`{ clientId }`), in position order, images with a
 * thumbnail URL. Reads only. Errors: `INVALID_INPUT`, `CLIENT_NOT_FOUND`,
 * `CLIENT_LOOKUP_FAILED`, `CLIENT_INVALID`. The caller has already authorized `manage clients`.
 */
export function makeListClientMaterial(clients: ClientRepository, storage: ClientMaterialStorage) {
  return async function listClientMaterial(input: unknown): Promise<Result<ListedClientAsset[]>> {
    const parsed = parseInput(listClientMaterialInputSchema, input);
    if (!parsed.ok) return parsed;
    const { clientId } = parsed.value;
    const found = await clients.findById(clientId);
    if (!found.ok) return found;
    if (found.value === null) return clientNotFound(clientId);
    const assets = await clients.listAssets(clientId);
    if (!assets.ok) return assets;
    return ok(await withThumbnails(storage, clientId, assets.value));
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One client file by id, removed or not (`deletedAt` set when it or its client is
 * deleted), or `ok(null)` when there is none (Story 4.5c-2: the material module's
 * rendition worker reads it). Reads only. Errors: `INVALID_INPUT` (malformed id),
 * `CLIENT_LOOKUP_FAILED`, `CLIENT_INVALID`.
 */
export function makeGetClientAsset(clients: Pick<ClientRepository, "findAsset">) {
  return async function getClientAsset(assetId: unknown): Promise<Result<StoredClientAsset | null>> {
    if (typeof assetId !== "string" || !UUID.test(assetId)) {
      return err({ code: "INVALID_INPUT", message: "Invalid input.", details: { fields: ["assetId"] } });
    }
    return clients.findAsset(assetId.toLowerCase());
  };
}
