import type { Actor } from "@/modules/access";
import { removeClientMaterialInputSchema } from "@/modules/case-study/domain/client-material";
import { parseInput } from "@/modules/case-study/domain/validation";
import { log } from "@/shared/log";
import { err, ok, type Result } from "@/shared/result";
import type { ClientMaterialDeps } from "./client-material-deps";

const notFound = (clientId: string, assetId: string) =>
  err({ code: "NOT_FOUND", message: "No such file.", details: { clientId, assetId } });

/**
 * Removes one file of a client at once, with no undo: deletes its `client_asset` row,
 * then its object. A failed object delete never fails the removal: it is logged
 * with the client and actor ids (never the key) and the object stays orphaned. An unknown file, or one of another
 * client, is `NOT_FOUND` and nothing is deleted. The caller has already authorized
 * `manage clients`. Errors: `INVALID_INPUT`, `NOT_FOUND`, `CLIENT_LOOKUP_FAILED`,
 * `CLIENT_WRITE_FAILED`.
 */
export function makeRemoveClientMaterial({ clients, storage }: Pick<ClientMaterialDeps, "clients" | "storage">) {
  return async function removeClientMaterial(actor: Actor, input: unknown): Promise<Result<void>> {
    const parsed = parseInput(removeClientMaterialInputSchema, input);
    if (!parsed.ok) return parsed;
    const { clientId, assetId } = parsed.value;

    const assets = await clients.listAssets(clientId);
    if (!assets.ok) return assets;
    const asset = assets.value.find((a) => a.id === assetId);
    if (asset === undefined) return notFound(clientId, assetId);

    const deleted = await clients.deleteAsset(assetId, clientId);
    if (!deleted.ok) return deleted;
    if (!deleted.value) return notFound(clientId, assetId);

    const removed = await storage.remove({ clientId, assetId, contentType: asset.contentType });
    if (!removed.ok) log.warn("client file object not deleted", { clientId, actorId: actor.id });
    return ok(undefined);
  };
}
