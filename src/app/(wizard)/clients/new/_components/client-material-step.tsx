"use client";

import { clientHref } from "@/app/_lib/routes";
import {
  confirmClientMaterialUpload,
  listClientMaterial,
  removeClientMaterial,
  requestClientMaterialUpload,
} from "@/app/(tool)/clients/actions";
import { imageSize } from "@/app/(tool)/clients/_components/use-client-logo";
import type { ClientMaterialLimits } from "@/app/(tool)/clients/_lib/client-limits";
import type { ListedClientAsset } from "@/modules/case-study";
import { fill, it } from "@/shared/i18n/it";
import type { StepAsset } from "../../../_components/asset-row";
import { MaterialStep, type MaterialActions } from "../../../_components/material-step";

const copy = it.clientWizard.material;

export interface ClientMaterialStepProps {
  clientId: string;
  /** The client's files from `getClient`, in position order. */
  initialAssets: ListedClientAsset[];
  limits: ClientMaterialLimits;
}

/**
 * Step 2 Materiale of the client wizard (Story 2.16): the case material step with the
 * client actions. Up to 3 files of the case material types (≤50 MB each); an image
 * must be ≥`minShortSide` px on the short side and ≤`maxSide` px on any side, checked
 * here when the browser can measure it and again at confirm. A 4th file is refused on
 * its row with "Massimo 3 file.", and the others keep uploading. Removal is immediate,
 * row and object, with no undo. No favourites. **Crea introduzione** stays inactive
 * until 2 images are stored, with the reason linked; until Story 3.9 it opens the client page.
 */
export function ClientMaterialStep({ clientId, initialAssets, limits }: ClientMaterialStepProps) {
  const listed = (asset: ListedClientAsset): StepAsset => ({
    id: asset.id,
    position: asset.position,
    kind: asset.kind,
    originalFileName: asset.fileName,
    contentType: asset.contentType,
    sizeBytes: asset.sizeBytes,
    createdAt: asset.createdAt,
    isFavourite: false,
    thumbnailUrl: asset.thumbnailUrl,
  });

  const actions: MaterialActions = {
    presign: ({ contentType, sizeBytes }) => requestClientMaterialUpload({ clientId, contentType, sizeBytes }),
    async confirm({ assetId, contentType, fileName }) {
      const confirmed = await confirmClientMaterialUpload({ clientId, assetId, contentType, fileName });
      return confirmed.ok ? { ok: true, value: listed(confirmed.value) } : confirmed;
    },
    async list() {
      const fresh = await listClientMaterial({ clientId });
      return fresh.ok ? { ok: true, value: fresh.value.map(listed) } : fresh;
    },
    remove: (assetId) => removeClientMaterial({ clientId, assetId }),
  };

  const pixels = fill(copy.errors.pixels, { min: limits.minShortSide, max: limits.maxSide });

  /** An image's pixels, when the browser can measure them; the server re-checks at confirm. */
  async function checkFile(file: File, contentType: string): Promise<string | null> {
    if (!contentType.startsWith("image/")) return null;
    const size = await imageSize(file);
    if (size === null) return null;
    const short = Math.min(size.width, size.height);
    const long = Math.max(size.width, size.height);
    return short < limits.minShortSide || long > limits.maxSide ? pixels : null;
  }

  return (
    <MaterialStep
      initialAssets={initialAssets.map(listed)}
      maxAssets={limits.maxFiles}
      maxFileBytes={limits.maxFileBytes}
      allowedContentTypes={limits.contentTypes}
      actions={actions}
      copy={{ heading: copy.heading, intro: copy.intro, limit: copy.errors.limit }}
      rejections={{ CLIENT_MATERIAL_LIMIT: copy.errors.limit, CLIENT_IMAGE_SIZE_INVALID: pixels }}
      // The module's `clientImageCount` rule. A browser component imports only types from
      // `@/modules/case-study`: a value import would bundle its server adapters.
      ready={(files) => files.filter((file) => file.kind === "image").length >= limits.minImages}
      footerAction={{ label: copy.createIntro, href: clientHref(clientId), reason: copy.createIntroReason }}
      checkFile={checkFile}
    />
  );
}
