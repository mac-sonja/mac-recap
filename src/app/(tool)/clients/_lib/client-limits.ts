import * as caseStudy from "@/modules/case-study";

/** The limits the client wizard checks before any request; the page passes the module's constants. */
export interface ClientLimits {
  /** `CLIENT_NAME_MAX`, counted like the server (UTF-16 length after trimming). */
  nameMax: number;
  /** `CLIENT_DESCRIPTION_MAX`, in characters (code points) after trimming. */
  descriptionMax: number;
  /** `CLIENT_BRIEF_MAX`, in characters (code points) after trimming. */
  briefMax: number;
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
    logoTypes: caseStudy.LOGO_CONTENT_TYPES,
    logoMaxBytes: caseStudy.LOGO_MAX_BYTES,
    logoMinShortSide: caseStudy.LOGO_MIN_SHORT_SIDE_PX,
  };
}
