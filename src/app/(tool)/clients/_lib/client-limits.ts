import * as caseStudy from "@/modules/case-study";

/** The limits the client wizard checks before any request; the page passes the module's constants. */
export interface ClientLimits {
  /** `CLIENT_NAME_MAX`, counted like the server (UTF-16 length after trimming). */
  nameMax: number;
  /** `CLIENT_DESCRIPTION_MAX`, in characters (code points) after trimming. */
  descriptionMax: number;
  /** `CLIENT_BRIEF_MAX`, in characters (code points) after trimming. */
  briefMax: number;
  /** `CLIENT_RESULT_LABEL_MAX`, in characters (code points) after trimming. */
  resultLabelMax: number;
  /** `CLIENT_RESULT_VALUE_MAX`, in characters (code points) after trimming. */
  resultValueMax: number;
  /** `CLIENT_TESTIMONIAL_QUOTE_MAX`, in characters (code points) after trimming. */
  testimonialQuoteMax: number;
  /** `CLIENT_TESTIMONIAL_AUTHOR_MAX`, in characters (code points) after trimming. */
  testimonialAuthorMax: number;
  /** `CLIENT_SECTOR_LABEL_MIN` / `_MAX`: a new sector's name, in characters (code points) after trimming. */
  sectorLabelMin: number;
  sectorLabelMax: number;
  /** `LOGO_CONTENT_TYPES`. */
  logoTypes: readonly string[];
  /** `LOGO_MAX_BYTES`. */
  logoMaxBytes: number;
  /** `LOGO_MIN_SHORT_SIDE_PX`. */
  logoMinShortSide: number;
}

/** The client wizard's limits, from the case-study module's single definitions (server side). */
export function clientLimits(): ClientLimits {
  return {
    nameMax: caseStudy.CLIENT_NAME_MAX,
    descriptionMax: caseStudy.CLIENT_DESCRIPTION_MAX,
    briefMax: caseStudy.CLIENT_BRIEF_MAX,
    resultLabelMax: caseStudy.CLIENT_RESULT_LABEL_MAX,
    resultValueMax: caseStudy.CLIENT_RESULT_VALUE_MAX,
    testimonialQuoteMax: caseStudy.CLIENT_TESTIMONIAL_QUOTE_MAX,
    testimonialAuthorMax: caseStudy.CLIENT_TESTIMONIAL_AUTHOR_MAX,
    sectorLabelMin: caseStudy.CLIENT_SECTOR_LABEL_MIN,
    sectorLabelMax: caseStudy.CLIENT_SECTOR_LABEL_MAX,
    logoTypes: caseStudy.LOGO_CONTENT_TYPES,
    logoMaxBytes: caseStudy.LOGO_MAX_BYTES,
    logoMinShortSide: caseStudy.LOGO_MIN_SHORT_SIDE_PX,
  };
}

/** The limits the client material step checks before any request (Story 2.16). */
export interface ClientMaterialLimits {
  /** `CLIENT_MATERIAL_MAX_FILES`. */
  maxFiles: number;
  /** `CLIENT_MATERIAL_MAX_BYTES`. */
  maxFileBytes: number;
  /** `CLIENT_MATERIAL_CONTENT_TYPES`. */
  contentTypes: readonly string[];
  /** `CLIENT_MATERIAL_MIN_IMAGES`. */
  minImages: number;
  /** `CLIENT_IMAGE_MIN_SHORT_SIDE_PX`. */
  minShortSide: number;
  /** `CLIENT_IMAGE_MAX_SIDE_PX`. */
  maxSide: number;
}

/** The client material step's limits, from the case-study module's single definitions (server side). */
export function clientMaterialLimits(): ClientMaterialLimits {
  return {
    maxFiles: caseStudy.CLIENT_MATERIAL_MAX_FILES,
    maxFileBytes: caseStudy.CLIENT_MATERIAL_MAX_BYTES,
    contentTypes: caseStudy.CLIENT_MATERIAL_CONTENT_TYPES,
    minImages: caseStudy.CLIENT_MATERIAL_MIN_IMAGES,
    minShortSide: caseStudy.CLIENT_IMAGE_MIN_SHORT_SIDE_PX,
    maxSide: caseStudy.CLIENT_IMAGE_MAX_SIDE_PX,
  };
}
