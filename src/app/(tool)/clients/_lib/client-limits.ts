import type { ClientLimits } from "@/app/(tool)/clients/_components/client-dialog";
import * as caseStudy from "@/modules/case-study";

/** The client dialog's limits, from the case-study module's single definitions (server side). */
export function clientLimits(): ClientLimits {
  return {
    nameMax: caseStudy.CLIENT_NAME_MAX,
    sectorMax: caseStudy.CLIENT_SECTOR_MAX,
    descriptionMax: caseStudy.CLIENT_DESCRIPTION_MAX,
    logoTypes: caseStudy.LOGO_CONTENT_TYPES,
    logoMaxBytes: caseStudy.LOGO_MAX_BYTES,
    logoMinShortSide: caseStudy.LOGO_MIN_SHORT_SIDE_PX,
  };
}
