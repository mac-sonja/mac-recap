import { NoActor } from "@/app/_components/no-actor";
import { resolveShellActor } from "@/app/_lib/surface";

/**
 * The focused wizard mode: no sidebar and no nav; the page's `WizardFrame` fills
 * the viewport and draws its own top bar (back arrow to Case studies). With no usable actor,
 * only the no-actor message renders, as in the `(tool)` layout.
 */
export default async function WizardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const shell = await resolveShellActor();
  if (shell === null) return <NoActor />;

  return <>{children}</>;
}
