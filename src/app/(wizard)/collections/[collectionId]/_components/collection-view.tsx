"use client";

import { ArrowLeft, Eye, Pencil, Tag } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import { DANGER_ACTION, PRIMARY_ACTION, SECONDARY_ACTION } from "@/app/_components/button-styles";
import { Dialog } from "@/app/_components/dialog";
import type { ActionResult } from "@/app/_lib/action-result";
import { collectionsHref } from "@/app/_lib/routes";
import { TagsFields, invalidFields, refusedFields, type CollectionField, type TagOptions, type TagsValue } from "@/app/(tool)/collections/_components/collection-fields";
import type { Page } from "@/modules/generation";
import type { FormatId, RenderAsset } from "@/modules/rendering";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { Canvas, type CanvasGroup } from "@/app/(wizard)/_components/configurator/canvas";
import type { InstagramView } from "@/app/(wizard)/_components/configurator/instagram-overlay";
import { StatusMessage, useStatusMessage } from "@/app/(wizard)/_components/configurator/status-message";
import { EYEBROW, ICON_BUTTON } from "@/app/(wizard)/_components/configurator/styles";
import { FormatSwitch } from "@/app/(wizard)/_components/configurator/top-bar";
import { AddCasesDialog } from "./add-cases-dialog";
import { collectionSegments, EMPTY_VALUES, groupOfCase, withCaseMoved, withGroupMoved, type CollectionCandidate, type CollectionGroup, type ViewSegment } from "./collection-file";
import { CollectionPagine } from "./collection-pagine";

/** What every items change returns: the collection's new version and its cases in order. */
type Write = ActionResult<{ collectionId: string; version: number; caseIds: string[] }>;

/** The collection page's server actions (Story 5.10a), each a compare-and-set on `expectedVersion`. */
export interface CollectionActions {
  moveGroup: (input: { collectionId: string; expectedVersion: number; clientId: string; to: number }) => Promise<Write>;
  moveItem: (input: { collectionId: string; expectedVersion: number; caseId: string; to: number }) => Promise<Write>;
  addItems: (input: { collectionId: string; expectedVersion: number; caseIds: string[] }) => Promise<Write>;
  removeItems: (input: { collectionId: string; expectedVersion: number; caseIds: string[] }) => Promise<Write>;
  retag: (input: { collectionId: string; expectedVersion: number } & TagsValue) => Promise<ActionResult<{ version: number; tags: { businessLines: string[]; industries: string[] } }>>;
}

export interface CollectionViewProps {
  id: string;
  name: string;
  version: number;
  tags: TagsValue;
  groups: readonly CollectionGroup[];
  assets: Readonly<Record<string, RenderAsset>>;
  candidates: readonly CollectionCandidate[];
  tagOptions: TagOptions;
  actions: CollectionActions;
}

const noop = () => {};
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/** The canvas groups of a format's segments: each with its heading, an unavailable case with its note. */
function canvasGroupsOf(segments: readonly ViewSegment[], groups: readonly CollectionGroup[]): CanvasGroup[] {
  const copy = it.collection;
  return segments.map((s) => {
    const group = groups.find((g) => g.clientId === s.clientId);
    const c = s.caseId === undefined ? undefined : group?.cases.find((x) => x.caseId === s.caseId);
    const label =
      s.kind === "intro"
        ? fill(copy.canvas.intro, { client: group?.clientName ?? "" })
        : s.kind === "closing"
          ? fill(copy.canvas.closing, { client: group?.clientName ?? "" })
          : fill(copy.canvas.case, { code: c?.code ?? "", name: c?.name ?? "" });
    return {
      key: s.key,
      label,
      template: s.template,
      values: s.values,
      pages: s.pages,
      ...(s.kind === "unavailable" ? { empty: `${copy.pages.unavailable}. ${copy.pages.unavailableNote}` } : {}),
    };
  });
}

/**
 * One collection (Story 5.10a) in the configurator's file view, every page read-only for now
 * (B7 makes texts editable): the top bar (back to Raccolte, the name, the format switch,
 * Anteprima, the tags with **Modifica tag**), the canvas with each client's group as
 * `composeParts` lays it out by default, and **Pagine** to arrange it. Pages are the cases' live
 * approved revisions, drawn as they are now.
 *
 * Every move is shown at once and saved at once with the collection's version (compare-and-set),
 * one after the other; a failed save puts the previous order back and says "Ordine non salvato.
 * Riprova." Adding and removing cases save, then read the page again (a client's intro may appear
 * or go). Removing the last case is refused.
 */
export function CollectionView({ id, name, version, tags: initialTags, groups: initialGroups, assets, candidates, tagOptions, actions }: CollectionViewProps) {
  const router = useRouter();
  const [message, say] = useStatusMessage();
  const [groups, setGroups] = useState(initialGroups);
  const [tags, setTags] = useState(initialTags);
  const [formatId, setFormatId] = useState<FormatId>("presentazione_16_9");
  const [preview, setPreview] = useState(false);
  const [slide, setSlide] = useState(0);
  const [instagram, setInstagram] = useState<InstagramView>("off");
  const [animateTexts, setAnimateTexts] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);
  const [removePending, setRemovePending] = useState(false);
  const [adding, setAdding] = useState(false);
  const [tagging, setTagging] = useState(false);
  const canvasRef = useRef<HTMLElement | null>(null);

  /** The version the server last confirmed: every write names it. */
  const versionRef = useRef(version);
  /** The order the server last confirmed: a failed move puts it back. */
  const confirmed = useRef(initialGroups);
  /** Writes run one after the other, so each names the version the one before returned. */
  const queue = useRef<Promise<void>>(Promise.resolve());
  /** Bumped by a failed move: the moves queued after it (made on the order it showed) are dropped. */
  const epoch = useRef(0);

  const segments = useMemo(() => collectionSegments(groups, formatId), [groups, formatId]);
  const canvasGroups = useMemo(() => canvasGroupsOf(segments, groups), [segments, groups]);
  const pages = useMemo<Page[]>(() => segments.flatMap((s) => s.pages), [segments]);
  const caseCount = groups.reduce((n, g) => n + g.cases.length, 0);
  const sectorLabel = (key: string) => tagOptions.sectors.find((s) => s.key === key)?.label ?? key;

  /** Shows `next` at once and saves it with `save`; a failure puts the confirmed order back. */
  const move = useCallback(
    (next: readonly CollectionGroup[], save: (expectedVersion: number) => Promise<Write>) => {
      setGroups(next);
      const mine = epoch.current;
      queue.current = queue.current.then(async () => {
        if (mine !== epoch.current) return;
        let result: Write | null;
        try {
          result = await save(versionRef.current);
        } catch {
          result = null;
        }
        if (result?.ok === true) {
          versionRef.current = result.value.version;
          confirmed.current = next;
          return;
        }
        epoch.current += 1;
        setGroups(confirmed.current);
        say(it.collection.orderFailed);
      });
    },
    [say],
  );

  const moveGroup = (clientId: string, to: number) => {
    const next = withGroupMoved(groups, clientId, to);
    if (next === groups) return;
    const group = next.find((g) => g.clientId === clientId)!;
    say(fill(it.collection.pages.moved, { name: group.clientName, n: next.indexOf(group) + 1, total: next.length }));
    move(next, (expectedVersion) => actions.moveGroup({ collectionId: id, expectedVersion, clientId, to: next.indexOf(group) }));
  };
  const moveCase = (caseId: string, to: number) => {
    const next = withCaseMoved(groups, caseId, to);
    if (next === groups) return;
    const group = groupOfCase(next, caseId)!;
    const at = group.cases.findIndex((c) => c.caseId === caseId);
    say(fill(it.collection.pages.moved, { name: group.cases[at]!.name, n: at + 1, total: group.cases.length }));
    move(next, (expectedVersion) => actions.moveItem({ collectionId: id, expectedVersion, caseId, to: at }));
  };

  /** After the queued moves: a write that changes what the page reads, then the page read again. */
  const writeThenRefresh = async (write: (expectedVersion: number) => Promise<Write>): Promise<Write | null> => {
    await queue.current;
    let result: Write | null;
    try {
      result = await write(versionRef.current);
    } catch {
      result = null;
    }
    if (result?.ok === true) {
      versionRef.current = result.value.version;
      router.refresh();
    } else if (result?.ok === false && (result.error.code === "STALE_COLLECTION" || result.error.code === "COLLECTION_NOT_FOUND")) {
      router.refresh();
    }
    return result;
  };

  const askRemove = (caseId: string) => {
    if (caseCount <= 1) {
      say(it.collection.remove.last);
      return;
    }
    setRemoving(caseId);
  };
  const remove = async () => {
    if (removing === null || removePending) return;
    setRemovePending(true);
    const caseId = removing;
    const result = await writeThenRefresh((expectedVersion) => actions.removeItems({ collectionId: id, expectedVersion, caseIds: [caseId] }));
    setRemovePending(false);
    setRemoving(null);
    if (result?.ok === true) return;
    const code = result?.ok === false ? result.error.code : null;
    say(code === "COLLECTION_LAST_ITEM" ? it.collection.remove.last : code === "STALE_COLLECTION" ? it.collections.stale : it.collection.remove.failed);
  };
  const add = async (caseIds: string[]): Promise<string | null> => {
    const result = await writeThenRefresh((expectedVersion) => actions.addItems({ collectionId: id, expectedVersion, caseIds }));
    if (result?.ok === true) return null;
    const code = result?.ok === false ? result.error.code : null;
    return code === "COLLECTION_FULL"
      ? it.collection.add.full
      : code === "CASE_NOT_COLLECTABLE"
        ? it.collection.add.notCollectable
        : code === "STALE_COLLECTION"
          ? it.collections.stale
          : it.collection.add.failed;
  };

  const removingCase = removing === null ? undefined : groupOfCase(groups, removing)?.cases.find((c) => c.caseId === removing);
  const selectSegment = (key: string) =>
    canvasRef.current?.querySelector(`[data-canvas-group="${key}"]`)?.scrollIntoView?.({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
  const pickFormat = (next: FormatId) => {
    setFormatId(next);
    setSlide(0);
  };

  const previewLabel = preview ? it.configurator.preview.leave : it.configurator.preview.enter;
  return (
    <div className="flex h-dvh flex-col bg-surface text-foreground">
      <p className="m-auto max-w-prose p-8 text-center font-body text-base text-foreground lg:hidden">{it.collection.narrowScreen}</p>
      <div className="hidden min-h-0 flex-1 flex-col lg:flex">
        <header className="grid h-14 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 border-b border-border bg-surface-sidebar px-3">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href={collectionsHref()}
              aria-label={it.collection.back}
              className="grid size-8 shrink-0 place-items-center rounded-full text-foreground transition-[background-color,transform] duration-150 hover:bg-surface-hover active:scale-[0.94]"
            >
              <ArrowLeft aria-hidden="true" className="size-[18px]" />
            </Link>
            <h1 className="ml-1 min-w-0 truncate font-label text-sm font-semibold text-foreground-strong">{name}</h1>
            <span className="shrink-0 font-label text-xs text-foreground-muted tabular-nums">{fill(it.collection.count, { n: caseCount })}</span>
          </div>
          <div className="flex items-center gap-2">
            <FormatSwitch formatId={formatId} onFormat={pickFormat} />
            <button
              type="button"
              aria-pressed={preview}
              aria-label={previewLabel}
              title={previewLabel}
              onClick={() => {
                setPreview(!preview);
                setSlide(0);
              }}
              className={cn(ICON_BUTTON, "size-8 bg-surface-raised text-foreground shadow-control aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary-hover")}
            >
              {preview ? <Pencil aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
            </button>
          </div>
          <div className="flex min-w-0 items-center justify-end gap-2">
            <ul aria-label={it.collection.tags.label} className="flex min-w-0 flex-wrap justify-end gap-1 overflow-hidden" style={{ maxHeight: "1.75rem" }}>
              {tags.businessLines.map((line) => (
                <li key={line} className="inline-flex items-center rounded-full bg-surface-control px-2 py-0.5 font-label text-xs text-foreground">
                  {it.businessLines[line]}
                </li>
              ))}
              {tags.industries.map((key) => (
                <li key={key} className="inline-flex items-center rounded-full bg-surface-selected px-2 py-0.5 font-label text-xs text-foreground">
                  {sectorLabel(key)}
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => setTagging(true)} className={cn(SECONDARY_ACTION, "h-8 shrink-0 px-3")}>
              <Tag aria-hidden="true" className="size-3.5" />
              {it.collection.tags.edit}
            </button>
          </div>
        </header>

        <main className="grid min-h-0 flex-1" style={{ gridTemplateColumns: `minmax(0,1fr) ${preview ? "0px" : "280px"}`, gridTemplateRows: "minmax(0,1fr)" }}>
          <div className="relative min-h-0">
            <StatusMessage message={message} />
            <Canvas
              formatId={formatId}
              template={segments[0]?.template ?? ""}
              pages={pages}
              groups={canvasGroups}
              assets={assets}
              values={segments[0]?.values ?? EMPTY_VALUES}
              selection={null}
              onSelect={noop}
              onPageInView={noop}
              trial={false}
              scrollRef={canvasRef}
              preview={preview}
              slide={slide}
              onStep={(delta) => setSlide((current) => Math.max(0, Math.min(pages.length - 1, current + delta)))}
              instagram={instagram}
              onInstagram={setInstagram}
              caption={name}
              animateTexts={animateTexts}
              onAnimateTexts={setAnimateTexts}
              reducedMotion={reducedMotion()}
              editable={false}
              editing={null}
              onEditRequest={noop}
              onTextInput={noop}
              onTextDone={noop}
              onResize={noop}
            />
          </div>
          <aside aria-label={it.collection.pages.label} hidden={preview} className="flex min-h-0 flex-col border-l border-border bg-surface-sidebar">
            <p className={cn(EYEBROW, "shrink-0 border-b border-border px-3.5 pt-3.5 pb-2.5")}>{it.collection.pages.label}</p>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <CollectionPagine
                formatId={formatId}
                groups={groups}
                segments={segments}
                assets={assets}
                onSelect={selectSegment}
                onMoveGroup={moveGroup}
                onMoveCase={moveCase}
                onRemove={askRemove}
                onAdd={() => setAdding(true)}
                onRefused={say}
              />
            </div>
          </aside>
        </main>
      </div>

      <Dialog
        open={removing !== null}
        onClose={() => {
          if (!removePending) setRemoving(null);
        }}
        title={fill(it.collection.remove.title, { name: removingCase?.name ?? "" })}
        description={it.collection.remove.description}
        actions={
          <>
            <button type="button" data-autofocus onClick={() => setRemoving(null)} className={SECONDARY_ACTION}>
              {it.collection.remove.cancel}
            </button>
            <button type="button" aria-disabled={removePending || undefined} onClick={() => void remove()} className={DANGER_ACTION}>
              {it.collection.remove.confirm}
            </button>
          </>
        }
      />
      <AddCasesDialog open={adding} onClose={() => setAdding(false)} candidates={candidates} tags={tags} onAdd={add} />
      <TagsDialog
        key={tagging ? "open" : "closed"}
        open={tagging}
        tags={tags}
        options={tagOptions}
        onClose={() => setTagging(false)}
        onSave={async (next) => {
          await queue.current;
          let result: Awaited<ReturnType<CollectionActions["retag"]>> | null;
          try {
            result = await actions.retag({ collectionId: id, expectedVersion: versionRef.current, ...next });
          } catch {
            result = null;
          }
          if (result?.ok === true) {
            versionRef.current = result.value.version;
            setTags(next);
            return null;
          }
          if (result?.ok === false && result.error.code === "INVALID_INPUT") return refusedFields(result.error.fields);
          return result?.ok === false && result.error.code === "STALE_COLLECTION" ? it.collections.stale : it.collection.tags.failed;
        }}
      />
    </div>
  );
}

/** **Modifica tag**: at least one business line and one industry, saved with the collection's version. */
function TagsDialog({
  open,
  tags,
  options,
  onClose,
  onSave,
}: {
  open: boolean;
  tags: TagsValue;
  options: TagOptions;
  onClose: () => void;
  /** Resolves to null when saved, the refused fields, or a failure to show. */
  onSave: (tags: TagsValue) => Promise<null | CollectionField[] | string>;
}) {
  const copy = it.collection.tags;
  const [value, setValue] = useState(tags);
  const [errors, setErrors] = useState<CollectionField[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const close = () => {
    if (!pending) onClose();
  };
  const save = async () => {
    if (pending) return;
    const wrong = invalidFields(value);
    setErrors(wrong);
    setFailure(null);
    if (wrong.length > 0) return;
    setPending(true);
    const result = await onSave(value);
    setPending(false);
    if (result === null) onClose();
    else if (typeof result === "string") setFailure(result);
    else setErrors(result);
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      wide
      title={copy.title}
      actions={
        <>
          <button type="button" onClick={close} className={SECONDARY_ACTION}>
            {copy.cancel}
          </button>
          <button type="button" aria-disabled={pending || undefined} onClick={() => void save()} className={cn(PRIMARY_ACTION, "aria-disabled:opacity-60")}>
            {copy.save}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <TagsFields value={value} onChange={setValue} options={options} errors={errors} disabled={pending} />
        <p role="alert" className="font-body text-sm text-danger empty:hidden">
          {failure ?? ""}
        </p>
      </div>
    </Dialog>
  );
}
