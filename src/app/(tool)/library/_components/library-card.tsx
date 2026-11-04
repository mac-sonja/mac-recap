import { ImageIcon } from "lucide-react";
import Link from "next/link";
import { PRESSABLE } from "@/app/_components/button-styles";
import { CARD } from "@/app/_components/field-styles";
import { caseViewHref } from "@/app/_lib/routes";
import type { Page } from "@/modules/generation";
import { renderFormat, type BoundValues, type RenderAsset } from "@/modules/rendering";
import { cn } from "@/shared/utils";

/** What a card's cover draws: page 1 of the live revision's Presentazione 16:9. */
export interface LibraryCover {
  template: string;
  page: Page;
  /** The display renditions of the assets the page uses; one not ready is left out (an empty cell). */
  assets: Readonly<Record<string, RenderAsset>>;
  values: BoundValues;
}

export interface LibraryCardProps {
  id: string;
  name: string;
  clientName: string;
  year: number;
  /** Null: the live revision has no Presentazione page, so a neutral placeholder shows. */
  cover: LibraryCover | null;
}

/**
 * One approved case in the library (Story 5.1): its cover, name, client and year. The whole
 * card is a link to the case view, so Tab reaches it and Enter opens it; the cover is
 * decoration (hidden from screen readers), drawn still and read-only by the shared renderer,
 * scaled to the card's width like the configurator's Pagine thumbnails.
 */
export function LibraryCard({ id, name, clientName, year, cover }: LibraryCardProps) {
  return (
    <li className="min-w-0">
      <Link
        href={caseViewHref(id)}
        data-case-id={id}
        className={cn(CARD, PRESSABLE, "group flex h-full flex-col overflow-hidden hover:bg-surface-hover")}
      >
        <span aria-hidden="true" inert className="pointer-events-none relative block aspect-video w-full overflow-hidden bg-surface-control">
          {cover === null ? (
            <span data-cover-placeholder="" className="absolute inset-0 flex items-center justify-center text-foreground-muted">
              <ImageIcon className="size-6" strokeWidth={1.5} />
            </span>
          ) : (
            <span data-cover="" className="block w-full">
              {renderFormat(cover.template, "presentazione_16_9", {
                pages: [cover.page],
                assets: cover.assets,
                values: cover.values,
                options: { still: true, startPage: 1 },
              })}
            </span>
          )}
        </span>
        <span className="flex min-w-0 flex-col gap-1 border-t border-border px-4 py-3.5">
          <span className="truncate font-body text-[15px] font-medium text-foreground-strong">{name}</span>
          <span className="truncate font-label text-[13px] text-foreground-muted">
            {clientName} · <span className="tabular-nums">{year}</span>
          </span>
        </span>
      </Link>
    </li>
  );
}
