import type { EmailLink, EmailLinkType } from "@/modules/access";

const LINK_TYPES: readonly EmailLinkType[] = ["signup", "email", "invite", "recovery"];

/** The link in a request: `?token_hash=&type=` (the app's email templates) or `?code=` (PKCE). */
export function linkFrom(params: URLSearchParams): EmailLink | null {
  const tokenHash = params.get("token_hash");
  const type = params.get("type");
  if (tokenHash && type && (LINK_TYPES as readonly string[]).includes(type)) {
    return { tokenHash, type: type as EmailLinkType };
  }
  const code = params.get("code");
  return code ? { code } : null;
}
