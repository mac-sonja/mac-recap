import { Pencil } from "lucide-react";
import Link from "next/link";
import { clientWizardHref } from "@/app/_lib/routes";
import { it } from "@/shared/i18n/it";

/**
 * **Modifica cliente** on a client's page: until Story 4.12 it opens the client
 * wizard at step 1 with the client's data, which states the code stays the same.
 * Hidden below 1024 px (read-only there).
 */
export function EditClientButton({ clientId }: { clientId: string }) {
  return (
    <Link
      href={clientWizardHref(clientId, 1)}
      className="hidden items-center gap-2 rounded-md bg-surface-control px-3 py-2 font-label text-sm text-foreground hover:bg-surface-selected lg:inline-flex"
    >
      <Pencil aria-hidden="true" className="size-4" />
      {it.clients.edit}
    </Link>
  );
}
