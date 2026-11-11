import { Suspense } from "react";
import { cookies } from "next/headers";
import { DraftReadyNotifier } from "@/app/_components/draft-ready-notifier";
import { NoActor } from "@/app/_components/no-actor";
import { listScopeFor } from "@/app/_lib/list-scope";
import { resolveShellActor } from "@/app/_lib/surface";
import { THEME_COOKIE, parseTheme } from "@/app/_lib/theme";
import { authorize, can, type Actor } from "@/modules/access";
import * as caseStudy from "@/modules/case-study";
import { it } from "@/shared/i18n/it";
import { Sidebar } from "./_components/sidebar";
import { clientsAccess } from "./clients/_lib/clients-surface";

/** Label for a role from the dictionary; roles without a label (system) show none. */
function roleLabel(role: string): string {
  return Object.hasOwn(it.role, role) ? it.role[role as keyof typeof it.role] : "";
}

/**
 * The sidebar's one count: cases waiting for a review (Clienti shows none, owner
 * 2026-10-28). Only what the policy lets the actor list; a failed read shows no
 * count rather than breaking the shell.
 */
async function toReviewCount(actor: Actor): Promise<number | null> {
  const scope = listScopeFor(actor);
  if (scope === null || !authorize(actor, "list cases", scope).ok) return null;
  const cases = await caseStudy.list(scope);
  return cases.ok ? cases.value.filter((c) => c.status === "in_review").length : null;
}

/**
 * The tool frame: left sidebar plus content. Nav items come from the access policy
 * (`can`), never from role names. With no usable actor, only the no-actor message
 * renders: no shell, no nav. Desktop only (≥1024 px). A role that may `generate` gets the
 * draft-ready toast (Story 3.8), its session starting at this render.
 */
export default async function ToolLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const shell = await resolveShellActor();
  if (shell === null) return <NoActor />;
  const { actor } = shell;
  const [toReview, cookieStore] = await Promise.all([toReviewCount(actor), cookies()]);

  return (
    <div className="flex min-h-screen bg-surface text-foreground">
      <Sidebar
        showNewCaseStudy={can(actor, "create case")}
        showCaseStudies={can(actor, "list cases")}
        // Story 5.9b: Clienti also for a role that may only download a client's pack (read-only).
        showClients={clientsAccess(actor) !== null}
        showLibrary={!can(actor, "list cases") && can(actor, "list cases", { status: "approved" })}
        showCollections={can(actor, "manage collections")}
        showOrganization={can(actor, "manage users")}
        displayName={actor.displayName}
        roleLabel={roleLabel(actor.role)}
        toReviewCount={toReview}
        theme={parseTheme(cookieStore.get(THEME_COOKIE)?.value)}
      />
      <main className="min-w-0 flex-1 px-8 py-10 xl:px-12">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>
      {can(actor, "generate") && (
        // The notifier reads the search params (the case page open); Suspense keeps that from opting the page out of server rendering.
        <Suspense fallback={null}>
          <DraftReadyNotifier startedAt={new Date().toISOString()} />
        </Suspense>
      )}
    </div>
  );
}
