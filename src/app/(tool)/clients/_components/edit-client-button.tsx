"use client";

import { Pencil } from "lucide-react";
import Link from "next/link";
import { SECONDARY_ACTION } from "@/app/_components/button-styles";
import { editClientPanelHref } from "@/app/_lib/routes";
import { it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { markPanelOpenedInApp } from "../_lib/panel-history";

/**
 * **Modifica** on a client's page: opens the edit panel (`?modifica=1`) with the
 * client's data, which states the code stays the same. Hidden below 1024 px
 * (read-only there).
 */
export function EditClientButton({ clientId }: { clientId: string }) {
  return (
    <Link href={editClientPanelHref(clientId)} scroll={false} onClick={markPanelOpenedInApp} className={cn(SECONDARY_ACTION, "hidden lg:inline-flex")}>
      <Pencil aria-hidden="true" className="size-3.5" />
      {it.clients.edit}
    </Link>
  );
}
