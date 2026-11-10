"use client";

import { Search } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { PRIMARY_ACTION, SECONDARY_ACTION } from "@/app/_components/button-styles";
import { Dialog } from "@/app/_components/dialog";
import { SEARCH_FIELD, SEARCH_ICON } from "@/app/_components/field-styles";
import { matchesCaseSearch } from "@/app/(tool)/case-studies/_components/filter-sort";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { matchesTags, type CollectionCandidate } from "./collection-file";

export interface AddCasesDialogProps {
  open: boolean;
  onClose: () => void;
  /** The approved cases not in the collection. */
  candidates: readonly CollectionCandidate[];
  tags: { businessLines: readonly string[]; industries: readonly string[] };
  /** **Aggiungi** with the cases picked, in the order they were picked; resolves to an error to show, or null when done. */
  onAdd: (caseIds: string[]) => Promise<string | null>;
}

/**
 * **Aggiungi casi** (Story 5.10a): the approved cases not in the collection yet, those whose
 * business line or client industry matches one of the collection's tags first. Search follows
 * the library's rules (`matchesCaseSearch`). Several can be picked; **Aggiungi** adds them, each
 * at the end of its client's group or as a new group at the end.
 */
export function AddCasesDialog({ open, onClose, candidates, tags, onAdd }: AddCasesDialogProps) {
  const copy = it.collection.add;
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const { suggested, others } = useMemo(() => {
    const shown = candidates.filter((c) => matchesCaseSearch(c, query));
    return { suggested: shown.filter((c) => matchesTags(c, tags)), others: shown.filter((c) => !matchesTags(c, tags)) };
  }, [candidates, query, tags]);

  const close = () => {
    if (pending) return;
    setQuery("");
    setPicked([]);
    setFailure(null);
    onClose();
  };
  const add = async () => {
    if (pending || picked.length === 0) return;
    setPending(true);
    setFailure(null);
    const error = await onAdd(picked);
    setPending(false);
    if (error === null) {
      setPicked([]);
      setQuery("");
      onClose();
    } else setFailure(error);
  };
  const toggle = (id: string) => setPicked((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));

  const list = (label: string, items: readonly CollectionCandidate[]) =>
    items.length === 0 ? null : (
      <section className="flex flex-col gap-1.5">
        <h3 className="font-label text-[11.5px] font-semibold tracking-[0.06em] text-foreground-muted uppercase">{label}</h3>
        <ul className="flex flex-col">
          {items.map((c) => (
            <li key={c.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-surface-hover">
                <input
                  type="checkbox"
                  data-candidate={c.id}
                  checked={picked.includes(c.id)}
                  onChange={() => toggle(c.id)}
                  aria-label={fill(copy.pick, { name: c.name })}
                  className="size-4 shrink-0 accent-primary"
                />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-body text-sm font-medium text-foreground-strong">{c.name}</span>
                  <span className="truncate font-label text-xs text-foreground-muted">
                    {c.clientName} · <span className="font-mono">{c.code}</span>
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>
    );

  return (
    <Dialog
      open={open}
      onClose={close}
      wide
      closeLabel={copy.cancel}
      title={copy.title}
      description={copy.description}
      actions={
        <>
          <span aria-live="polite" className="mr-auto self-center font-label text-[13px] text-foreground-muted tabular-nums">
            {picked.length === 0 ? "" : picked.length === 1 ? copy.pickedOne : fill(copy.picked, { n: picked.length })}
          </span>
          <button type="button" onClick={close} className={SECONDARY_ACTION}>
            {copy.cancel}
          </button>
          <button
            type="button"
            aria-disabled={picked.length === 0 || pending || undefined}
            onClick={() => void add()}
            className={cn(PRIMARY_ACTION, "aria-disabled:cursor-not-allowed aria-disabled:opacity-50")}
          >
            {copy.confirm}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="relative">
          <label htmlFor={searchId} className="sr-only">
            {copy.search}
          </label>
          <Search aria-hidden="true" className={SEARCH_ICON} />
          <input id={searchId} type="search" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.search} className={SEARCH_FIELD} />
        </div>
        <div className="flex max-h-[min(420px,50dvh)] flex-col gap-4 overflow-y-auto">
          {candidates.length === 0 ? (
            <p className="font-body text-sm text-foreground-muted">{copy.none}</p>
          ) : suggested.length + others.length === 0 ? (
            <p role="status" className="font-body text-sm text-foreground-muted">
              {fill(copy.noMatch, { query: query.trim() })}
            </p>
          ) : (
            <>
              {list(copy.suggested, suggested)}
              {list(copy.others, others)}
            </>
          )}
        </div>
        <p role="alert" className="font-body text-sm text-danger empty:hidden">
          {failure ?? ""}
        </p>
      </div>
    </Dialog>
  );
}
