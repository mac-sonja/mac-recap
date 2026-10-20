import { Pencil } from "lucide-react";
import Link from "next/link";
import { SECONDARY_ACTION } from "@/app/_components/button-styles";
import { clientWizardHref } from "@/app/_lib/routes";
import { it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";

/**
 * **Modifica** on a client's page: until Story 4.12 it opens the client wizard at
 * step 1 with the client's data, which states the code stays the same. Hidden
 * below 1024 px (read-only there).
 */
export function EditClientButton({ clientId }: { clientId: string }) {
  return (
    <Link href={clientWizardHref(clientId, 1)} className={cn(SECONDARY_ACTION, "hidden lg:inline-flex")}>
      <Pencil aria-hidden="true" className="size-3.5" />
      {it.clients.edit}
    </Link>
  );
}
