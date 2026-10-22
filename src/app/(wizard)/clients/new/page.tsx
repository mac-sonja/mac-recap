import { redirect } from "next/navigation";
import { editClientPanelHref, newClientPanelHref } from "@/app/_lib/routes";

export interface NewClientPageProps {
  searchParams: Promise<{ clientId?: string | string[]; step?: string | string[] }>;
}

/** A client id: a uuid, as `getClient` accepts it. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The old client wizard's URL (Story 2.15), kept so bookmarks and old links still
 * work: the side panel replaced the wizard (owner, 2026-10-21). Without `clientId`
 * it opens the add panel on the Clienti list; with one, that client's page with the
 * edit panel (any `step`). A malformed or repeated id goes to `/clients`; an unknown
 * one is sent back to `/clients` by the client's page. The target pages check the
 * role, so this page reads nothing.
 */
export default async function NewClientPage({ searchParams }: NewClientPageProps) {
  const { clientId } = await searchParams;
  if (clientId === undefined) redirect(newClientPanelHref());
  if (typeof clientId !== "string" || !UUID.test(clientId)) redirect("/clients");
  redirect(editClientPanelHref(clientId));
}
