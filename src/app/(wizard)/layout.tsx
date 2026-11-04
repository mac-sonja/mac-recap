import { DraftReadyNotifier } from "@/app/_components/draft-ready-notifier";
import { NoActor } from "@/app/_components/no-actor";
import { resolveShellActor } from "@/app/_lib/surface";
import { can } from "@/modules/access";

/**
 * The focused wizard mode: no sidebar and no nav; the page's `WizardFrame` fills
 * the viewport and draws its own top bar (back arrow to Case studies). With no usable actor,
 * only the no-actor message renders, as in the `(tool)` layout. A role that may `generate`
 * gets the draft-ready toast here too (Story 3.8: wizard and configurator).
 */
export default async function WizardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const shell = await resolveShellActor();
  if (shell === null) return <NoActor />;

  return (
    <>
      {children}
      {can(shell.actor, "generate") && <DraftReadyNotifier startedAt={new Date().toISOString()} />}
    </>
  );
}
