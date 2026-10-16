"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ClientDetail } from "@/modules/case-study";
import { it } from "@/shared/i18n/it";
import { ClientDialog, type ClientLimits } from "./client-dialog";

/**
 * **Modifica cliente** on a client's page: opens the edit dialog, which states the
 * code stays the same and that approved case histories keep their data. Hidden
 * below 1024 px (read-only there). After a save the page refreshes, so the new
 * info shows everywhere; focus returns to this button.
 */
export function EditClientButton({ client, limits }: { client: ClientDetail; limits: ClientLimits }) {
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
        {it.clients.edit}
      </button>
      {open ? (
        <ClientDialog
          mode={{ kind: "edit", client }}
          limits={limits}
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
