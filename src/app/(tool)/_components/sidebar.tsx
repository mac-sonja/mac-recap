"use client";

import { Building2, Folder, LayoutDashboard, Library, Plus, Search, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { PRESSABLE } from "@/app/_components/button-styles";
import { SEARCH_FIELD, SEARCH_ICON } from "@/app/_components/field-styles";
import type { ThemeChoice } from "@/app/_lib/theme";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { MacWordmark } from "@/app/_components/mac-wordmark";
import { ThemeSwitch } from "./theme-switch";
import { UserMenu } from "./user-menu";

export interface SidebarProps {
  /** Policy decisions made by the layout through `access.can`; absent items are not rendered. */
  showNewCaseStudy: boolean;
  showCaseStudies: boolean;
  /** `list clients`: the Clienti item, right after Case. */
  showClients: boolean;
  /** Account/sales/social: the Libreria item (approved cases only). */
  showLibrary?: boolean;
  /** `manage users` (admin): the Organizzazione item, right after Clienti. */
  showOrganization?: boolean;
  displayName: string;
  roleLabel: string;
  /** Cases waiting for a review, shown after Case; nothing when 0 or unknown. */
  toReviewCount?: number | null;
  /** The appearance choice from the theme cookie. */
  theme?: ThemeChoice;
}

/** The "{n} da approvare" note opens the Case page on the Da approvare queue (Story 4.1, owner 2026-10-28). */
const TO_REVIEW_HREF = "/case-studies?status=in_review";

/** Full labels at ≥1280 px; icons only at 1024–1279 px, labels kept for screen readers. */
const LABEL = "sr-only xl:not-sr-only";

function NavLink({
  href,
  icon: Icon,
  label,
  active,
  meta,
  metaHref,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  active: boolean;
  /** A short note after the label (a count), hidden when the sidebar is collapsed. */
  meta?: string | null;
  /** Where the note goes, when it is a link of its own, laid over the item's right end (links can't nest). */
  metaHref?: string;
}) {
  const link = (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      title={label}
      className={cn(
        "flex h-9 items-center justify-center gap-2.5 rounded-md px-2.5 font-label text-sm text-foreground-muted transition-colors duration-150 hover:bg-surface-hover hover:text-foreground xl:justify-start",
        active && "bg-surface-selected font-medium text-foreground hover:bg-surface-selected",
      )}
    >
      <Icon aria-hidden="true" className="size-[18px] shrink-0" strokeWidth={1.75} />
      <span className={LABEL}>{label}</span>
      {meta && metaHref === undefined ? (
        <span className="ml-auto hidden font-label text-xs font-normal text-foreground-muted tabular-nums xl:inline">
          {meta}
        </span>
      ) : null}
    </Link>
  );
  if (!meta || metaHref === undefined) return link;
  return (
    <div className="relative">
      {link}
      <Link
        href={metaHref}
        className="absolute inset-y-1.5 right-1.5 hidden items-center rounded-sm px-1 font-label text-xs font-normal text-foreground-muted tabular-nums transition-colors duration-150 hover:text-foreground hover:underline underline-offset-2 xl:flex"
      >
        {meta}
      </Link>
    </div>
  );
}

/**
 * The search above **Nuova case history**: Enter opens the Case history page filtered
 * by the text (`?q=`), which searches names, clients, codes and business lines.
 * Collapsed (1024–1279 px) it is a magnifier that opens the Case history page.
 */
function SidebarSearch() {
  const router = useRouter();
  const id = useId();
  const [text, setText] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = text.trim();
    router.push(query === "" ? "/case-studies" : `/case-studies?q=${encodeURIComponent(query)}`);
    setText("");
  }

  return (
    <>
      <form role="search" onSubmit={submit} className="relative mb-3 hidden xl:block">
        <label htmlFor={id} className="sr-only">
          {it.shell.nav.search.label}
        </label>
        <Search aria-hidden="true" className={SEARCH_ICON} />
        <input
          id={id}
          type="search"
          autoComplete="off"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={it.shell.nav.search.placeholder}
          className={SEARCH_FIELD}
        />
      </form>
      <Link
        href="/case-studies"
        title={it.shell.nav.search.label}
        aria-label={it.shell.nav.search.label}
        className="mb-3 flex h-9 items-center justify-center rounded-md text-foreground-muted transition-colors duration-150 hover:bg-surface-hover hover:text-foreground xl:hidden"
      >
        <Search aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
      </Link>
    </>
  );
}

export function Sidebar({
  showNewCaseStudy,
  showCaseStudies,
  showClients,
  showLibrary = false,
  showOrganization = false,
  displayName,
  roleLabel,
  toReviewCount = null,
  theme = "system",
}: SidebarProps) {
  const pathname = usePathname();
  const isHome = pathname === "/home";
  const isCaseStudies = pathname === "/case-studies";
  // The list and every client's page.
  const isClients = pathname === "/clients" || pathname.startsWith("/clients/");

  return (
    <aside className="sticky top-0 flex h-dvh w-16 shrink-0 flex-col border-r bg-surface-sidebar xl:w-64">
      <nav aria-label={it.shell.nav.label} className="flex flex-1 flex-col gap-0.5 p-2 xl:p-4">
        <p className="mb-8 hidden items-end gap-2 px-2 pt-2 text-foreground-strong xl:flex">
          <MacWordmark label={it.app.name} className="h-[22px] w-auto" />
          {/* The wordmark's label already reads "MAC Recap". */}
          <span aria-hidden="true" className="font-label text-[11px] leading-none font-semibold tracking-[0.18em]">
            {it.app.wordmarkSuffix}
          </span>
        </p>
        {showCaseStudies && <SidebarSearch />}
        {showNewCaseStudy && (
          <Link
            href="/case-studies/new"
            title={it.shell.nav.newCaseStudy}
            className={cn(
              "mb-8 flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-3 font-label text-sm font-semibold text-primary-foreground shadow-primary hover:bg-primary-hover xl:justify-start",
              PRESSABLE,
            )}
          >
            <Plus aria-hidden="true" className="size-[18px] shrink-0" strokeWidth={2.25} />
            <span className={LABEL}>{it.shell.nav.newCaseStudy}</span>
          </Link>
        )}
        {showCaseStudies && <NavLink href="/home" icon={LayoutDashboard} label={it.shell.nav.home} active={isHome} />}
        {showCaseStudies && (
          <NavLink
            href="/case-studies"
            icon={Folder}
            label={it.shell.nav.caseStudies}
            active={isCaseStudies}
            meta={toReviewCount ? fill(it.shell.nav.toReview, { n: toReviewCount }) : null}
            metaHref={TO_REVIEW_HREF}
          />
        )}
        {showLibrary && (
          <NavLink href="/library" icon={Library} label={it.shell.nav.library} active={pathname === "/library"} />
        )}
        {showClients && <NavLink href="/clients" icon={Building2} label={it.shell.nav.clients} active={isClients} />}
        {showOrganization && (
          <NavLink
            href="/organization"
            icon={Users}
            label={it.shell.nav.organization}
            active={pathname === "/organization"}
          />
        )}
      </nav>
      <div className="flex flex-col gap-4 p-2 pb-4 xl:p-4">
        <ThemeSwitch initial={theme} />
        <UserMenu displayName={displayName} roleLabel={roleLabel} />
      </div>
    </aside>
  );
}
