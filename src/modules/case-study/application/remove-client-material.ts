import type { Actor } from "@/modules/access";
import { removeClientMaterialInputSchema } from "@/modules/case-study/domain/client-material";
import { parseInput } from "@/modules/case-study/domain/validation";
import { err, ok, type Result } from "@/shared/result";
import { clientNotFound, type ClientMaterialDeps } from "./client-material-deps";

const notFound = (clientId: string, assetId: string) =>
  err({ code: "NOT_FOUND", message: "No such file.", details: { clientId, assetId } });

/**
 * Removes one file of a client at once, with no undo (Story 4.5c-2: a soft delete): its
 * `client_asset` row gets `deleted_at`, so it leaves every list and frees its 1–3 slot,
 * while its object and renditions stay. A revision that still references it then
 * reports `MATERIAL_MISSING` at approval, as for a removed case file. An unknown file,
 * one already removed, or one of another client, is `NOT_FOUND` and nothing changes; a
 * deleted client is `CLIENT_NOT_FOUND`. Case status never changes. The caller has
 * already authorized `manage clients`. Errors: `INVALID_INPUT`, `NOT_FOUND`,
 * `CLIENT_NOT_FOUND`, `CLIENT_LOOKUP_FAILED`, `CLIENT_WRITE_FAILED`.
 */
export function makeRemoveClientMaterial({ clients }: Pick<ClientMaterialDeps, "clients">) {
  return async function removeClientMaterial(_actor: Actor, input: unknown): Promise<Result<void>> {
    const parsed = parseInput(removeClientMaterialInputSchema, input);
    if (!parsed.ok) return parsed;
    const { clientId, assetId } = parsed.value;

    const found = await clients.findById(clientId);
    if (!found.ok) return found;
    if (found.value === null) return clientNotFound(clientId);

    const assets = await clients.listAssets(clientId);
    if (!assets.ok) return assets;
    if (!assets.value.some((a) => a.id === assetId)) return notFound(clientId, assetId);

    const deleted = await clients.deleteAsset(assetId, clientId);
    if (!deleted.ok) return deleted;
    if (!deleted.value) return notFound(clientId, assetId);
    return ok(undefined);
  };
}
