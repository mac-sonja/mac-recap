import { SIGN_UP_DOMAIN } from "@/modules/access";
import { fill, it } from "@/shared/i18n/it";

/** What an auth form shows after a submit: a message, and the fields to mark. */
export interface AuthFormState {
  message?: string;
  fields?: string[];
  /** Sign-up: the confirmation email went to this address. */
  sentTo?: string;
  /** Forgot password: the request was accepted. */
  sent?: boolean;
  /**
   * What was typed, so a failed submit keeps it (React resets a form after its
   * action). Never the password.
   */
  values?: Record<string, string>;
}

/** The Italian message for an access error code; unknown codes get the generic one. */
export function authMessage(code: string): string {
  switch (code) {
    case "INVALID_CREDENTIALS":
      return it.auth.signIn.invalidCredentials;
    case "EMAIL_NOT_CONFIRMED":
      return it.auth.signIn.notConfirmed;
    case "ACCOUNT_INACTIVE":
    case "UNAUTHENTICATED":
      return it.auth.signIn.inactive;
    case "LINK_INVALID":
      return it.auth.signIn.linkInvalid;
    case "EMAIL_DOMAIN_NOT_ALLOWED":
      return fill(it.auth.signUp.domainNotAllowed, { domain: SIGN_UP_DOMAIN });
    case "INVALID_INPUT":
      return it.auth.signUp.invalid;
    case "RATE_LIMITED":
      return it.auth.rateLimited;
    default:
      return it.auth.failed;
  }
}

/** Notices the sign-in screen shows from its `?avviso=` parameter. */
const NOTICES: Readonly<Record<string, string>> = {
  inattivo: it.auth.signIn.inactive,
  "link-scaduto": it.auth.signIn.linkInvalid,
};

export function signInNotice(key: string | undefined): string | null {
  return key !== undefined && Object.hasOwn(NOTICES, key) ? NOTICES[key] : null;
}
