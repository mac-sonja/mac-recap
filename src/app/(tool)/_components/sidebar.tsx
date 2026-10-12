"use client";

import { FolderOpen, Plus, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { UserMenu } from "./user-menu";

export interface SidebarProps {
  /** Policy decisions made by the layout through `access.can`; absent items are not rendered. */
  showNewCaseStudy: boolean;
  showCaseStudies: boolean;
  displayName: string;
  roleLabel: string;
}

/** Full labels at ≥1280 px; icons only at 1024–1279 px, labels kept for screen readers. */
const LABEL = "sr-only xl:not-sr-only";

function NavLink({ href, icon: Icon, label, active }: { href: string; icon: LucideIcon; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      title={label}
      className={cn(
        "flex items-center justify-center gap-3 rounded-md px-3 py-2 font-label text-sm text-foreground-muted hover:bg-surface hover:text-foreground xl:justify-start",
        active && "bg-surface text-foreground",
      )}
    >
      <Icon aria-hidden="true" className="size-5 shrink-0" />
      <span className={LABEL}>{label}</span>
    </Link>
  );
}

export function Sidebar({ showNewCaseStudy, showCaseStudies, displayName, roleLabel }: SidebarProps) {
  const pathname = usePathname();
  const isCaseStudies = pathname === "/case-studies";

  return (
    <aside className="flex w-16 shrink-0 flex-col border-r bg-surface-raised xl:w-60">
      <nav aria-label={it.shell.nav.label} className="flex flex-1 flex-col gap-1 p-2 xl:p-3">
        <p className="mb-3 hidden px-3 pt-2 font-display text-base font-semibold text-foreground xl:block">
          {it.app.name}
        </p>
        {showNewCaseStudy && (
          <Link
            href="/case-studies/new"
            title={it.shell.nav.newCaseStudy}
            className="mb-2 flex items-center justify-center gap-3 rounded-md bg-primary px-3 py-2 font-label text-sm text-primary-foreground hover:opacity-90 xl:justify-start"
          >
            <Plus aria-hidden="true" className="size-5 shrink-0" />
            <span className={LABEL}>{it.shell.nav.newCaseStudy}</span>
          </Link>
        )}
        {showCaseStudies && (
          <NavLink href="/case-studies" icon={FolderOpen} label={it.shell.nav.caseStudies} active={isCaseStudies} />
        )}
      </nav>
      <div className="border-t p-2 xl:p-3">
        <UserMenu displayName={displayName} roleLabel={roleLabel} />
      </div>
    </aside>
  );
}
