import type { ClientSummary } from "@/modules/case-study/domain/case-study";
import { log } from "@/shared/log";
import { ok, type Result } from "@/shared/result";
import type { ClientRepository } from "@/modules/case-study/ports/client-repository";
import type { LogoStorage } from "@/modules/case-study/ports/logo-storage";
import { LOGO_URL_TTL_SECONDS } from "./get-client";

const collator = new Intl.Collator("it", { sensitivity: "base", numeric: true });

/**
 * Every client with its count of non-deleted case studies and a signed URL of its
 * current logo (all signed in one storage call, valid `LOGO_URL_TTL_SECONDS`), sorted
 * by name (Italian, case- and accent-insensitive; ties keep the repository's order).
 * A client without a logo gets `logoUrl: null`. Signing never fails the list: a logo
 * that could not be signed gets null and a warning is logged (client id only).
 * The caller has already authorized `list clients`.
 */
export function makeListClientSummaries(clients: ClientRepository, storage: LogoStorage) {
  return async function listClientSummaries(): Promise<Result<ClientSummary[]>> {
    const listed = await clients.listWithCaseCounts();
    if (!listed.ok) return listed;

    const targets = listed.value.flatMap(({ id, logo }) => (logo === null ? [] : [{ clientId: id, logoId: logo.id, contentType: logo.contentType }]));
    const urls = new Map<string, string | null>();
    if (targets.length > 0) {
      const signed = await storage.presignDownloads(targets, LOGO_URL_TTL_SECONDS);
      targets.forEach(({ clientId }, i) => {
        const url = signed.ok ? (signed.value[i] ?? null) : null;
        if (url === null) log.warn("client logo could not be signed", { clientId });
        urls.set(clientId, url);
      });
    }

    return ok(
      listed.value
        .map(({ id, name, code, caseCount, complete }, index) => ({ client: { id, name, code, caseCount, complete, logoUrl: urls.get(id) ?? null }, index }))
        .sort((a, b) => collator.compare(a.client.name, b.client.name) || a.index - b.index)
        .map(({ client }) => client),
    );
  };
}
