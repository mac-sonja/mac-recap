import * as caseStudy from "@/modules/case-study";
import * as material from "@/modules/material";
import type { ListedAsset } from "@/modules/material";
import type { RenderAsset } from "@/modules/rendering";
import { log } from "@/shared/log";
import { ok, type Result } from "@/shared/result";
import { renderAssetsOf } from "../../../_lib/configurator-data";
import { isMedia } from "../../../_components/configurator/media-files";

// Story 4.11a, server only: "Dalle sue case", the images and videos of a client's cases, for
// the client-mode configurator's page and its actions. The caller has authorized the actor.

/**
 * The images and videos of client `clientId`'s non-deleted cases, newest case first, each
 * case's oldest first. A case whose files can't be read is left out (logged with its id) and
 * never drops the others; only a failed list of the cases is an error.
 */
export async function caseMediaOfClient(clientId: string): Promise<Result<ListedAsset[]>> {
  const cases = await caseStudy.list({ clientId });
  if (!cases.ok) return cases;
  const listed = await Promise.all(cases.value.map((c) => material.listAssets({ caseId: c.id })));
  const media: ListedAsset[] = [];
  listed.forEach((files, i) => {
    if (files.ok) media.push(...files.value.filter(isMedia));
    else log.warn(`case material not read: ${files.error.code}`, { caseId: cases.value[i]!.id, clientId });
  });
  return ok(media);
}

/**
 * The render assets of a client's cases' images and videos, one file at a time: a file whose
 * rendition can't be read is left out (logged) and never drops the others.
 */
export async function caseMediaRenderAssets(files: readonly Pick<ListedAsset, "id" | "kind">[]): Promise<Record<string, RenderAsset>> {
  const each = await Promise.all(
    files.map((file) =>
      renderAssetsOf([file], (assetId, spec) => material.getRendition(assetId, spec)).catch(() => {
        log.warn("case rendition not read");
        return {};
      }),
    ),
  );
  return Object.assign({}, ...each) as Record<string, RenderAsset>;
}
