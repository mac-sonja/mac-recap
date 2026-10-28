import { redirect } from "next/navigation";
import { PageHeader } from "@/app/_components/page-header";
import { CARD } from "@/app/_components/field-styles";
import { resolveShellActor } from "@/app/_lib/surface";
import { can } from "@/modules/access";
import { it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";

/**
 * The account/sales/social landing. Story 5.1 builds the library of approved
 * cases here; until then it is a placeholder, so sign-in has somewhere to land.
 * Only roles that may list approved cases see it.
 */
export default async function LibraryPage() {
  const shell = await resolveShellActor();
  if (shell === null) return null;
  if (!can(shell.actor, "list cases", { status: "approved" })) redirect(shell.landing);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={it.library.title} lead={it.library.lead} />
      <p className={cn(CARD, "px-6 py-10 text-center font-body text-sm text-foreground-muted")}>{it.library.soon}</p>
    </div>
  );
}
