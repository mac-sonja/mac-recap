"use client";

import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { DANGER_ACTION, PRIMARY_ACTION, PRESSABLE, ROW_PILL, SECONDARY_ACTION } from "@/app/_components/button-styles";
import { Dialog } from "@/app/_components/dialog";
import { CARD, TH } from "@/app/_components/field-styles";
import { collectionHref } from "@/app/_lib/routes";
import { CHOICE_PILL, PILL_GAP } from "@/app/(tool)/clients/_components/industry-pills";
import type { BusinessLine, ClientSector } from "@/modules/case-study";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { deleteCollection, renameCollection } from "../actions";
import { nameError, NameField, toggled } from "./collection-fields";

/** One collection as the Raccolte list shows it (Story 5.10a). */
export interface CollectionRow {
  id: string;
  name: string;
  version: number;
  businessLines: BusinessLine[];
  industries: string[];
  caseCount: number;
  /** Who created it, or null when no longer known. */
  createdBy: string | null;
  updatedAt: string;
  /** `updatedAt` formatted for display (Europe/Rome, Italian). */
  updatedLabel: string;
}

export interface CollectionsTableProps {
  rows: readonly CollectionRow[];
  businessLines: readonly BusinessLine[];
  sectors: readonly ClientSector[];
}

/** The rows that carry at least one of the picked business lines and one of the picked industries (an empty facet keeps every row). */
export function filterCollections(rows: readonly CollectionRow[], lines: readonly string[], industries: readonly string[]): CollectionRow[] {
  return rows.filter(
    (row) =>
      (lines.length === 0 || row.businessLines.some((l) => lines.includes(l))) &&
      (industries.length === 0 || row.industries.some((i) => industries.includes(i))),
  );
}

/** A tag as a small read-only pill. */
const TAG = "inline-flex items-center rounded-full bg-surface-control px-2 py-0.5 font-label text-xs text-foreground";

/**
 * The Raccolte list (Story 5.10a): name, tags, number of cases, last update and who created it,
 * newest update first. Filters by business line and by industry (OR within one, AND across
 * them). Each row opens its collection, and offers **Rinomina** (1–120 characters) and
 * **Elimina** (after a confirmation; a soft delete).
 */
export function CollectionsTable({ rows, businessLines, sectors }: CollectionsTableProps) {
  const copy = it.collections;
  const router = useRouter();
  const [lines, setLines] = useState<BusinessLine[]>([]);
  const [industries, setIndustries] = useState<string[]>([]);
  // By id: after a refresh the dialog takes the row as read again (its new version).
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const renaming = renamingId === null ? null : (rows.find((r) => r.id === renamingId) ?? null);
  const [deleting, setDeleting] = useState<CollectionRow | null>(null);
  const linesId = useId();
  const industriesId = useId();
  const sectorLabel = (key: string) => sectors.find((s) => s.key === key)?.label ?? key;
  const shown = filterCollections(rows, lines, industries);
  const filtered = lines.length > 0 || industries.length > 0;
  // Only the industries some collection carries are worth filtering by.
  const usedSectors = sectors.filter((s) => rows.some((r) => r.industries.includes(s.key)));
  const usedLines = businessLines.filter((l) => rows.some((r) => r.businessLines.includes(l)));

  return (
    <div className="flex flex-col gap-5">
      <div role="group" aria-label={copy.filters.label} className="flex flex-col gap-3">
        {usedLines.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <span id={linesId} className="w-20 font-label text-[13px] font-medium text-foreground-muted">
              {copy.filters.businessLine}
            </span>
            <div role="group" aria-labelledby={linesId} className={cn("flex flex-wrap", PILL_GAP)}>
              {usedLines.map((line) => (
                <button key={line} type="button" aria-pressed={lines.includes(line)} onClick={() => setLines(toggled(lines, line, businessLines))} className={CHOICE_PILL}>
                  {it.businessLines[line]}
                </button>
              ))}
            </div>
          </div>
        )}
        {usedSectors.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <span id={industriesId} className="w-20 font-label text-[13px] font-medium text-foreground-muted">
              {copy.filters.industry}
            </span>
            <div role="group" aria-labelledby={industriesId} className={cn("flex flex-wrap", PILL_GAP)}>
              {usedSectors.map((sector) => (
                <button
                  key={sector.key}
                  type="button"
                  aria-pressed={industries.includes(sector.key)}
                  onClick={() => setIndustries(toggled(industries, sector.key, sectors.map((s) => s.key)))}
                  className={CHOICE_PILL}
                >
                  {sector.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <p role="status" className="font-body text-[15px] text-foreground">
            {copy.noResults}
          </p>
          {filtered && (
            <button
              type="button"
              onClick={() => {
                setLines([]);
                setIndustries([]);
              }}
              className={SECONDARY_ACTION}
            >
              {copy.filters.clear}
            </button>
          )}
        </div>
      ) : (
        <div className={cn(CARD, "overflow-x-auto")}>
          <table className="w-full border-collapse text-left font-body text-sm text-foreground">
            <caption className="sr-only">{copy.table.caption}</caption>
            <thead className="border-b border-border">
              <tr>
                <th scope="col" className={TH}>
                  {copy.table.columns.name}
                </th>
                <th scope="col" className={TH}>
                  {copy.table.columns.tags}
                </th>
                <th scope="col" className={TH}>
                  {copy.table.columns.cases}
                </th>
                <th scope="col" className={TH}>
                  {copy.table.columns.updated}
                </th>
                <th scope="col" className={TH}>
                  {copy.table.columns.createdBy}
                </th>
                <th scope="col" className={cn(TH, "text-right")}>
                  {copy.table.columns.actions}
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.id} data-collection-id={row.id} className="border-b border-border last:border-b-0 hover:bg-surface-hover">
                  <td className="px-4 py-3.5 font-medium text-foreground-strong">
                    <Link href={collectionHref(row.id)} aria-label={fill(copy.openLabel, { name: row.name })} className="hover:underline underline-offset-2">
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <ul className="flex max-w-xs flex-wrap gap-1">
                      {row.businessLines.map((line) => (
                        <li key={line} className={TAG}>
                          {it.businessLines[line]}
                        </li>
                      ))}
                      {row.industries.map((key) => (
                        <li key={key} className={cn(TAG, "bg-surface-selected")}>
                          {sectorLabel(key)}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-foreground-muted tabular-nums">{fill(copy.caseCount, { n: row.caseCount })}</td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-foreground-muted tabular-nums">{row.updatedLabel}</td>
                  <td className="px-4 py-3.5 text-foreground">{row.createdBy ?? copy.unknownCreator}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-1.5">
                      <Link href={collectionHref(row.id)} className={cn(ROW_PILL, PRESSABLE)}>
                        {copy.open}
                      </Link>
                      <button
                        type="button"
                        aria-label={fill(copy.rename.label, { name: row.name })}
                        title={copy.rename.button}
                        onClick={() => setRenamingId(row.id)}
                        className="inline-flex size-8 items-center justify-center rounded-md text-foreground-muted transition-[background-color,color,transform] duration-150 ease-out hover:bg-surface-hover hover:text-foreground active:scale-[0.97]"
                      >
                        <Pencil aria-hidden="true" className="size-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={fill(copy.delete.label, { name: row.name })}
                        title={copy.delete.button}
                        onClick={() => setDeleting(row)}
                        className="inline-flex size-8 items-center justify-center rounded-md text-foreground-muted transition-[background-color,color,transform] duration-150 ease-out hover:bg-surface-hover hover:text-danger active:scale-[0.97]"
                      >
                        <Trash2 aria-hidden="true" className="size-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RenameDialog key={renamingId ?? "none"} row={renaming} onClose={() => setRenamingId(null)} onDone={() => router.refresh()} />
      <DeleteDialog row={deleting} onClose={() => setDeleting(null)} onDone={() => router.refresh()} />
    </div>
  );
}

/** **Rinomina**: the name, 1–120 characters; a compare-and-set on the collection's version. */
function RenameDialog({ row, onClose, onDone }: { row: CollectionRow | null; onClose: () => void; onDone: () => void }) {
  const copy = it.collections;
  const [name, setName] = useState(row?.name ?? "");
  const [error, setError] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const close = () => {
    if (!pending) onClose();
  };
  const save = async () => {
    if (row === null || pending) return;
    const wrong = nameError(name);
    setError(wrong);
    setFailure(null);
    if (wrong) return;
    setPending(true);
    try {
      const result = await renameCollection({ collectionId: row.id, expectedVersion: row.version, name });
      setPending(false);
      if (result.ok) {
        onClose();
        onDone();
        return;
      }
      if (result.error.code === "INVALID_INPUT") setError(true);
      else if (result.error.code === "STALE_COLLECTION" || result.error.code === "COLLECTION_NOT_FOUND") {
        setFailure(copy.stale);
        onDone();
      } else setFailure(copy.rename.failed);
    } catch {
      setPending(false);
      setFailure(copy.rename.failed);
    }
  };
  return (
    <Dialog
      open={row !== null}
      onClose={close}
      title={copy.rename.title}
      actions={
        <>
          <button type="button" onClick={close} className={SECONDARY_ACTION}>
            {copy.rename.cancel}
          </button>
          <button type="button" aria-disabled={pending || undefined} onClick={() => void save()} className={cn(PRIMARY_ACTION, "aria-disabled:opacity-60")}>
            {copy.rename.save}
          </button>
        </>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <NameField value={name} onChange={setName} error={error} disabled={pending} />
        <p role="alert" className="font-body text-sm text-danger empty:hidden">
          {failure ?? ""}
        </p>
      </form>
    </Dialog>
  );
}

/** **Elimina**, after a confirmation: a soft delete; the cases stay where they are. */
function DeleteDialog({ row, onClose, onDone }: { row: CollectionRow | null; onClose: () => void; onDone: () => void }) {
  const copy = it.collections.delete;
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const close = () => {
    if (pending) return;
    setFailure(null);
    onClose();
  };
  const confirm = async () => {
    if (row === null || pending) return;
    setPending(true);
    setFailure(null);
    try {
      const result = await deleteCollection({ collectionId: row.id });
      setPending(false);
      if (result.ok || result.error.code === "COLLECTION_NOT_FOUND") {
        onClose();
        onDone();
        return;
      }
      setFailure(copy.failed);
    } catch {
      setPending(false);
      setFailure(copy.failed);
    }
  };
  return (
    <Dialog
      open={row !== null}
      onClose={close}
      title={fill(copy.title, { name: row?.name ?? "" })}
      description={copy.description}
      actions={
        <>
          <button type="button" data-autofocus onClick={close} className={SECONDARY_ACTION}>
            {copy.cancel}
          </button>
          <button type="button" aria-disabled={pending || undefined} onClick={() => void confirm()} className={DANGER_ACTION}>
            {copy.confirm}
          </button>
        </>
      }
    >
      <p role="alert" className="font-body text-sm text-danger empty:hidden">
        {failure ?? ""}
      </p>
    </Dialog>
  );
}
