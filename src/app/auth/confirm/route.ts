import { NextResponse, type NextRequest } from "next/server";
import { confirmEmailLink } from "@/modules/access";
import { linkFrom } from "./link";

/**
 * Where Supabase Auth emails land (sign-up confirmation, invite, password reset):
 * the link becomes a session, then the person goes to their landing or to set a
 * password. A bad or used link returns to sign-in with a notice. It runs before
 * there is an actor, so it calls only `confirmEmailLink`.
 */
export async function GET(request: NextRequest) {
  const link = linkFrom(request.nextUrl.searchParams);
  const result = link === null ? null : await confirmEmailLink(link);
  const target = request.nextUrl.clone();
  target.search = "";
  if (result?.ok) {
    target.pathname = result.value;
  } else {
    target.pathname = "/sign-in";
    target.searchParams.set("avviso", result?.error.code === "ACCOUNT_INACTIVE" ? "inattivo" : "link-scaduto");
  }
  return NextResponse.redirect(target);
}
