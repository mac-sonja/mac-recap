import { requireSurface } from "@/app/_lib/surface";
import { it } from "@/shared/i18n/it";

// Placeholder: the new-case-study wizard is the Story 2.5 UI part. Bozza rows of the
// Case studies table open it as `?caseId={id}`. Below 1024 px it shows the
// larger-screen message instead of its content; the heading shows at every width.
export default async function NewCaseStudyPage() {
  const shell = await requireSurface("create case");
  if (shell === null) return null;

  return (
    <>
      <h1 className="font-heading text-2xl font-semibold text-foreground">{it.shell.nav.newCaseStudy}</h1>
      <p className="mt-4 max-w-prose font-body text-base text-foreground lg:hidden">{it.caseStudies.narrowScreen}</p>
      {/* The wizard content (Story 2.5 UI part) goes here; hidden below 1024 px. */}
      <div className="hidden lg:block" />
    </>
  );
}
