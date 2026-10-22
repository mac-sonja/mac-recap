"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * The wizard footer's bottom-left slot, filled by the frame for every step (the case
 * wizard's **Elimina bozza**, owner 2026-10-22: bottom left, opposite **Avanti**).
 */
const FooterLeadContext = createContext<ReactNode>(undefined);

export function WizardFooterLeadProvider({ lead, children }: { lead?: ReactNode; children: ReactNode }) {
  return <FooterLeadContext.Provider value={lead}>{children}</FooterLeadContext.Provider>;
}

/**
 * The sticky wizard footer (Story 2.18): solid page colour, divider on top, flush with
 * the viewport's bottom edge. The background reaches 24 px past the column on each side
 * (`before:`), so the cards' edges and shadows don't peek out beside it.
 */
export const WIZARD_FOOTER =
  "sticky bottom-0 z-10 mt-8 flex items-center justify-between gap-6 border-t border-border bg-surface pt-4 pb-6 before:absolute before:inset-y-0 before:-inset-x-6 before:-z-10 before:bg-surface";

/**
 * The wizard footer under a divider: the step's action (**Avanti**) on the right with
 * its optional note, and the frame's lead (e.g. **Elimina bozza**) on the left. With no
 * lead the note sits on the left, as before. It keeps its place in the flow, so the
 * content above is never hidden once scrolled to the end, and focus order is unchanged.
 * Below 1024 px the step content (footer included) is hidden by the frame.
 */
export function WizardFooter({ start, action }: { start?: ReactNode; action: ReactNode }) {
  const lead = useContext(FooterLeadContext);
  const note = <div className="font-label text-xs text-foreground-muted">{start}</div>;
  return (
    <div data-wizard-footer="" className={WIZARD_FOOTER}>
      {lead === undefined ? (
        <>
          {note}
          <div className="shrink-0">{action}</div>
        </>
      ) : (
        <>
          <div className="shrink-0">{lead}</div>
          <div className="flex min-w-0 items-center gap-4 text-right">
            {note}
            <div className="shrink-0">{action}</div>
          </div>
        </>
      )}
    </div>
  );
}
