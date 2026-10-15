"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Client } from "@/modules/case-study";
import { it } from "@/shared/i18n/it";
import { ClientNameDialog } from "./client-name-dialog";

/**
 * **Modifica nome** on a client's page: opens the rename dialog, which states the
 * code stays the same. Hidden below 1024 px (read-only there). After a save the
 * page refreshes, so the new name shows everywhere; focus returns to this button.
 */
export function RenameClientButton({ client, nameMaxLength }: { client: Client; nameMaxLength: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden items-center gap-2 rounded-md bg-surface-control px-3 py-2 font-label text-sm text-foreground hover:bg-surface-selected lg:inline-flex"
      >
        <Pencil aria-hidden="true" className="size-4" />
        {it.clients.rename}
      </button>
      {open ? (
        <ClientNameDialog
          mode={{ kind: "rename", client }}
          maxLength={nameMaxLength}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
