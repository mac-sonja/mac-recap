import { headers } from "next/headers";

/**
 * The app's own origin for this request (behind a proxy, from `x-forwarded-*`).
 * Only used to build the return address in auth emails; Supabase accepts it only
 * when it is on the project's redirect allow-list.
 */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto.split(",")[0].trim()}://${host.split(",")[0].trim()}`;
}
