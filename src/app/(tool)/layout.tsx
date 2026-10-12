import { NoActor } from "@/app/_components/no-actor";
import { resolveShellActor } from "@/app/_lib/surface";
import { can } from "@/modules/access";
import { it } from "@/shared/i18n/it";
import { Sidebar } from "./_components/sidebar";

/** Label for a role from the dictionary; roles without a label (system) show none. */
function roleLabel(role: string): string {
  return Object.hasOwn(it.role, role) ? it.role[role as keyof typeof it.role] : "";
}

/**
 * The tool frame: left sidebar plus content. Nav items come from the access policy
 * (`can`), never from role names. With no usable actor, only the no-actor message
 * renders: no shell, no nav. Desktop only (≥1024 px).
 */
export default async function ToolLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const shell = await resolveShellActor();
  if (shell === null) return <NoActor />;
  const { actor } = shell;

  return (
    <div className="flex min-h-screen bg-surface text-foreground">
      <Sidebar
        showNewCaseStudy={can(actor, "create case")}
        showCaseStudies={can(actor, "list cases")}
        displayName={actor.displayName}
        roleLabel={roleLabel(actor.role)}
      />
      <main className="min-w-0 flex-1 p-8">{children}</main>
    </div>
  );
}
