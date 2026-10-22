"use client";

import { ImageUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { PRIMARY_ACTION, PRIMARY_ACTION_INACTIVE, SECONDARY_ACTION } from "@/app/_components/button-styles";
import { CARD_LABEL, FIELD, FIELD_HINT, FIELD_LABEL, TEXTAREA } from "@/app/_components/field-styles";
import { Sheet } from "@/app/_components/sheet";
import type { ActionResult } from "@/app/_lib/action-result";
import { clientHref, editClientPanelHref } from "@/app/_lib/routes";
import { createClient, saveClientBriefField, saveClientResults, saveClientTestimonial, updateClient } from "@/app/(tool)/clients/actions";
import { acceptFor } from "@/app/(wizard)/_lib/upload";
import { useAutosaveFields } from "@/app/(wizard)/_components/use-autosave-fields";
import { FieldCard } from "@/app/(wizard)/_components/field-card";
import { RequiredLabel } from "@/app/(wizard)/_components/required-label";
import type { Client, ClientBrief, ClientBriefField, ClientDetail, ClientIndustry, ClientResult, ListedClientAsset } from "@/modules/case-study";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import type { ClientLimits, ClientMaterialLimits } from "../_lib/client-limits";
import { ClientImageSlots, useClientImages } from "./client-image-slots";
import {
  ClientResultsFields,
  emptyStoryInputs,
  charCount,
  ERROR,
  isAuthorOnly,
  isHalfRow,
  isOver,
  resultRowsOf,
  rowsToSend,
  savedRowsOf,
  testimonialToSend,
  type IncompleteKey,
  type ResultRow,
  type StoryInputs,
  type Testimonial,
} from "./client-results-fields";
import { DeleteClientButton } from "./delete-client-button";
import { IndustryPills } from "./industry-pills";
import { LogoTile } from "./logo-tile";
import { LogoStepFailed, logoFailureOf, useClientLogo, type LogoFailure } from "./use-client-logo";
import { clearPanelOpenedInApp, panelOpenedInApp } from "../_lib/panel-history";

const copy = it.clientPanel.details;

/** The brief texts in `CLIENT_BRIEF_FIELDS` order (the module's index is server-only). */
const BRIEF_FIELDS = ["context", "solution"] as const satisfies readonly ClientBriefField[];

/**
 * What the Racconto card autosaves: the two texts, then the results and the
 * testimonial, each held as the JSON of what would be sent (`rowsToSend`, one entry
 * per row; `testimonialToSend`), so a half row, a part over its limit or a lone
 * author changes nothing and keeps what the server holds.
 */
type StoryField = ClientBriefField | "results" | "testimonial";
const STORY_FIELDS = [...BRIEF_FIELDS, "results", "testimonial"] as const satisfies readonly StoryField[];

/** The fields saved on Aggiungi / Salva (the brief autosaves once the client exists). */
type InfoKey = "name" | "industries" | "description" | "logo";

interface InfoFields {
  name: string;
  industries: ClientIndustry[];
  description: string;
}

/** How many live-region lines stay mounted. */
const ANNOUNCEMENTS_KEPT = 5;
/** The panel is for wide screens only, like the buttons that open it. */
const WIDE = "(min-width: 1024px)";

const sameInfo = (a: InfoFields | null, b: InfoFields) =>
  a !== null &&
  a.name === b.name &&
  a.description === b.description &&
  a.industries.length === b.industries.length &&
  a.industries.every((industry, index) => industry === b.industries[index]);

function subscribeWide(onChange: () => void) {
  const query = window.matchMedia?.(WIDE);
  query?.addEventListener?.("change", onChange);
  return () => query?.removeEventListener?.("change", onChange);
}
const isWide = () => window.matchMedia?.(WIDE).matches ?? true;

export interface ClientPanelProps {
  /** The client being edited (with its brief), or null to add one. */
  client: ClientDetail | null;
  /** The client's files, in position order (empty for a new client). */
  assets: readonly ListedClientAsset[];
  /** The client's non-deleted case history count, for **Elimina cliente**; null hides it. */
  caseCount: number | null;
  /** `CLIENT_INDUSTRIES`, in display order. */
  industries: readonly ClientIndustry[];
  limits: ClientLimits;
  materialLimits: ClientMaterialLimits;
}

/**
 * The client side panel (owner's mock, 2026-10-21), replacing the client wizard: a
 * `Sheet` over the Clienti list (**Nuovo cliente**, `?nuovo=1`) or the client's page
 * (**Modifica cliente**, `?modifica=1`), with one form in three numbered cards:
 * 01 Dettagli (Nome, Settore, Descrizione), 02 Logo e immagini (logo and image
 * slots), 03 Racconto (Contesto, Soluzione, then the optional Risultati and
 * Testimonial). Every field, the logo, the two texts and `minImages` images are
 * needed: **Aggiungi** / **Salva** stays inactive until then, with the reason linked
 * by `aria-describedby`. Lengths are checked here first (inline error, no request);
 * a half-filled result row or an author without a quote stops the save at that field.
 *
 * **Aggiungi**: `createClient` (the code is assigned), then the logo (presign → PUT
 * → confirm → `updateClient` links it), then the texts, results and testimonial, then the images that
 * waited in the browser; then the client's page opens. If a step after the create
 * fails, the panel stays open as **Modifica cliente** for the new id (the URL names
 * it, so a reload resumes it), the error shows, and **Salva** retries only what is
 * left (a confirmed logo is re-linked, not uploaded again).
 *
 * On an existing client the logo and the images upload as soon as they are picked
 * (the logo is linked on **Salva**, which deletes the old one), a removed image goes
 * at once, the texts autosave, and name, industries and description save on
 * **Salva**, which closes the panel on the client's page. **Annulla**, the × and Esc
 * close it, asking `wizard.unsavedConfirm` first when something is not saved. Below
 * 1024 px the panel does not open (read-only there).
 */
export function ClientPanel({ client: initialClient, assets, caseCount, industries: options, limits, materialLimits }: ClientPanelProps) {
  const router = useRouter();
  const wide = useSyncExternalStore(subscribeWide, isWide, () => false);
  const baseId = useId();
  const ids = {
    name: `${baseId}-name`,
    nameError: `${baseId}-name-error`,
    industriesLabel: `${baseId}-industries-label`,
    industriesHint: `${baseId}-industries-hint`,
    industriesError: `${baseId}-industries-error`,
    description: `${baseId}-description`,
    descriptionHint: `${baseId}-description-hint`,
    counter: `${baseId}-description-counter`,
    descriptionError: `${baseId}-description-error`,
    logoLabel: `${baseId}-logo-label`,
    logoHint: `${baseId}-logo-hint`,
    logoReplaceHint: `${baseId}-logo-replace-hint`,
    logoError: `${baseId}-logo-error`,
    reason: `${baseId}-reason`,
  };

  /** The client as last saved; null until Aggiungi has created it. Read synchronously by the autosave and uploads. */
  const clientRef = useRef<Client | null>(initialClient);
  const [client, setClient] = useState<Client | null>(initialClient);
  /** The info fields the server holds, so a save skips an unchanged update. */
  const savedInfo = useRef<InfoFields | null>(
    initialClient === null
      ? null
      : { name: initialClient.name, industries: [...initialClient.industries], description: initialClient.description ?? "" },
  );
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [closing, setClosing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<InfoKey, string>>>({});
  const [announcements, setAnnouncements] = useState<ReadonlyArray<{ id: number; text: string }>>([]);
  const nextAnnouncement = useRef(0);
  const unmounted = useRef(false);
  const textareas = useRef<Partial<Record<ClientBriefField, HTMLTextAreaElement | null>>>({});
  const firstPill = useRef<HTMLDivElement>(null);
  /** Opened by a link in the app (a pushed history entry): closing goes back instead of replacing. */
  const [openedInApp] = useState(panelOpenedInApp);
  /** The client was created by this panel: closing goes to its page, not back to the list. */
  const createdHere = useRef(false);
  /** Leaving the panel (closing, saved, or Back confirmed): history events are ours. */
  const leaving = useRef(false);
  /** A confirmed discard: pending brief text is not written any more. */
  const discarding = useRef(false);
  /** The panel's history entry, to restore when Back is cancelled. */
  const panelEntry = useRef<{ href: string; state: unknown } | null>(null);

  const [name, setName] = useState(initialClient?.name ?? "");
  const [industries, setIndustries] = useState<ClientIndustry[]>(() => [...(initialClient?.industries ?? [])]);
  const [description, setDescription] = useState(initialClient?.description ?? "");

  const logo = useClientLogo(limits, { logoId: initialClient?.logoId ?? null, logoUrl: initialClient?.logoUrl ?? null }, () => busy.current);
  /** The running or finished upload of the picked logo, so a save waits for it instead of uploading again. */
  const logoJob = useRef<{ file: File; promise: Promise<string> } | null>(null);
  const images = useClientImages(materialLimits, assets, () => clientRef.current?.id ?? null, (text) => announce(text));

  const briefTooLong = (text: string) => charCount(text.trim()) > limits.briefMax;
  const initialBrief: ClientBrief = initialClient?.brief ?? { context: "", solution: "", results: [], testimonialQuote: "", testimonialAuthor: "" };

  // Risultati and Testimonial as typed; the autosave holds what would be saved of them.
  const [rows, setRows] = useState<ResultRow[]>(() => resultRowsOf(initialBrief.results));
  const rowsRef = useRef(rows);
  const [quote, setQuote] = useState(initialBrief.testimonialQuote);
  const [author, setAuthor] = useState(initialBrief.testimonialAuthor);
  const testimonialRef = useRef({ quote: initialBrief.testimonialQuote, author: initialBrief.testimonialAuthor });
  /** What the server holds, per row and for the testimonial: kept for a row or part that can't be sent yet. */
  const savedRows = useRef(savedRowsOf(initialBrief.results));
  const savedTestimonial = useRef<Testimonial>({ quote: initialBrief.testimonialQuote, author: initialBrief.testimonialAuthor });
  const resultsKey = (next: readonly ResultRow[]) => JSON.stringify(rowsToSend(next, savedRows.current, limits));
  const testimonialKey = (next: Testimonial) => JSON.stringify(testimonialToSend(next.quote, next.author, savedTestimonial.current, limits));
  /** The incomplete-entry messages shown: after focus leaves the row (or testimonial) or a save is attempted. */
  const [revealed, setRevealed] = useState<ReadonlySet<IncompleteKey>>(() => new Set());
  const storyInputs = useRef<StoryInputs>(emptyStoryInputs());

  /** A half row or a lone author: it is not saved, so closing would lose it. */
  function firstIncomplete(): IncompleteKey | undefined {
    const row = rowsRef.current.findIndex(isHalfRow);
    if (row !== -1) return `row-${row}`;
    const { quote: typedQuote, author: typedAuthor } = testimonialRef.current;
    return isAuthorOnly(typedQuote, typedAuthor) ? "testimonial" : undefined;
  }

  /** A results or testimonial part over its limit: it is never sent. */
  function storyOverLong(): HTMLElement | null | undefined {
    for (const [index, row] of rowsRef.current.entries()) {
      const inputs = storyInputs.current.rows[index];
      if (isOver(row.label, limits.resultLabelMax)) return inputs?.label;
      if (isOver(row.value, limits.resultValueMax)) return inputs?.value;
    }
    const { quote: typedQuote, author: typedAuthor } = testimonialRef.current;
    if (isOver(typedQuote, limits.testimonialQuoteMax)) return storyInputs.current.quote;
    if (isOver(typedAuthor, limits.testimonialAuthorMax)) return storyInputs.current.author;
    return undefined;
  }

  // The results and testimonial never hold an over-long part (`rowsToSend`, `testimonialToSend`).
  const storyTooLong = (text: string, field: StoryField) => field !== "results" && field !== "testimonial" && briefTooLong(text);

  const storyLabel = (field: StoryField) =>
    field === "results" ? copy.results.title : field === "testimonial" ? copy.testimonial.title : copy.labels[field];

  function announce(text: string) {
    if (unmounted.current) return;
    const line = { id: nextAnnouncement.current++, text };
    setAnnouncements((current) => [...current, line].slice(-ANNOUNCEMENTS_KEPT));
  }

  const brief = useAutosaveFields<StoryField>({
    fields: STORY_FIELDS,
    initial: {
      context: initialBrief.context,
      solution: initialBrief.solution,
      results: resultsKey(rows),
      testimonial: testimonialKey(testimonialRef.current),
    },
    save: async (field, text) => {
      const current = clientRef.current;
      if (current === null) return false;
      if (field === "results") {
        const perRow = JSON.parse(text) as (ClientResult | null)[];
        const results = perRow.filter((row) => row !== null);
        const saved = (await saveClientResults({ clientId: current.id, results })).ok;
        if (saved) savedRows.current = perRow;
        return saved;
      }
      if (field === "testimonial") {
        const next = JSON.parse(text) as Testimonial;
        const saved = (await saveClientTestimonial({ clientId: current.id, ...next })).ok;
        if (saved) savedTestimonial.current = next;
        return saved;
      }
      return (await saveClientBriefField({ clientId: current.id, field, text })).ok;
    },
    tooLong: storyTooLong,
    active: () => clientRef.current !== null && !discarding.current,
    onSaveFailed: (field) => announce(fill(copy.announceError, { field: storyLabel(field), message: copy.errors.saveFailed })),
    hasOtherUnsaved: () =>
      logo.logo.kind === "new" ||
      images.hasLocal ||
      !sameInfo(savedInfo.current, currentInfo()) ||
      firstIncomplete() !== undefined ||
      storyOverLong() !== undefined,
    // A link inside the panel clicked with unsaved changes: leave only once confirmed.
    onUnsavedLink: (href) => {
      if (window.confirm(it.wizard.unsavedConfirm)) router.push(href);
    },
  });

  useEffect(() => {
    unmounted.current = false;
    clearPanelOpenedInApp();
    panelEntry.current = { href: window.location.href, state: window.history.state };
    return () => {
      unmounted.current = true;
    };
  }, []);

  // Back (or Forward) away from the panel with unsaved entries asks first; cancelled, the
  // panel URL comes back and Next's own handler never runs (a capture listener runs first).
  const unsavedRef = useRef<() => boolean>(() => false);
  useEffect(() => {
    function onPopState(event: PopStateEvent) {
      const entry = panelEntry.current;
      if (leaving.current || entry === null || window.location.href === entry.href) return;
      if (!unsavedRef.current() || window.confirm(it.wizard.unsavedConfirm)) {
        discarding.current = true;
        leaving.current = true;
        return;
      }
      event.stopImmediatePropagation();
      window.history.pushState(entry.state, "", entry.href);
    }
    window.addEventListener("popstate", onPopState, true);
    return () => window.removeEventListener("popstate", onPopState, true);
  }, []);

  /** Presign → PUT → confirm the picked logo once; a second call for the same file waits for the first. */
  function uploadLogo(clientId: string): Promise<string> {
    const current = logo.logo;
    if (current.kind !== "new") return Promise.reject(new LogoStepFailed("fatal"));
    if (logoJob.current?.file === current.file) return logoJob.current.promise;
    const promise = logo.upload(clientId);
    logoJob.current = { file: current.file, promise };
    promise.catch(() => {
      if (logoJob.current?.promise === promise) logoJob.current = null;
    });
    return promise;
  }

  // On an existing client a picked logo uploads at once; Salva links it.
  const pickedLogo = logo.logo.kind === "new" ? logo.logo.file : null;
  useEffect(() => {
    const current = clientRef.current;
    if (pickedLogo === null || current === null) return;
    uploadLogo(current.id).catch((error: unknown) => {
      if (!unmounted.current && !busy.current) showLogoFailure(error instanceof LogoStepFailed ? error.kind : "retry");
    });
    // Only a new pick starts an upload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedLogo]);

  function focusUnsavedText() {
    const unsaved = brief.firstUnsaved();
    if (unsaved === "results") {
      // The first row with something typed (the save sends every filled row).
      const index = Math.max(0, rowsRef.current.findIndex((row) => row.label.trim() !== "" || row.value.trim() !== ""));
      storyInputs.current.rows[index]?.label?.focus();
    }
    else if (unsaved === "testimonial") storyInputs.current.quote?.focus();
    else if (unsaved !== undefined) textareas.current[unsaved]?.focus();
  }

  function changeRow(index: number, part: keyof ResultRow, text: string) {
    rowsRef.current = rowsRef.current.map((row, at) => (at === index ? { ...row, [part]: text } : row));
    setRows(rowsRef.current);
    // Complete or emptied: its message waits for focus to leave it again.
    if (!isHalfRow(rowsRef.current[index])) conceal(`row-${index}`);
    brief.change("results", resultsKey(rowsRef.current));
  }

  function changeTestimonial(next: { quote: string; author: string }) {
    testimonialRef.current = next;
    setQuote(next.quote);
    setAuthor(next.author);
    if (!isAuthorOnly(next.quote, next.author)) conceal("testimonial");
    brief.change("testimonial", testimonialKey(next));
  }

  function reveal(key: IncompleteKey) {
    setRevealed((current) => (current.has(key) ? current : new Set(current).add(key)));
  }

  function conceal(key: IncompleteKey) {
    setRevealed((current) => {
      if (!current.has(key)) return current;
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  }

  /** Shows the first half row or lone author and focuses its empty part; true when there was one. */
  function stopAtIncomplete(): boolean {
    const key = firstIncomplete();
    if (key === undefined) return false;
    flushSync(() => reveal(key));
    if (key === "testimonial") {
      storyInputs.current.quote?.focus();
    } else {
      const index = Number(key.slice("row-".length));
      const inputs = storyInputs.current.rows[index];
      (rowsRef.current[index]?.label.trim() === "" ? inputs?.label : inputs?.value)?.focus();
    }
    return true;
  }

  function clearError(key: InfoKey) {
    setErrors((current) => {
      if (current[key] === undefined) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function showErrors(next: Partial<Record<InfoKey, string>>) {
    // Commit aria-invalid and the messages before focus moves, so they are announced.
    flushSync(() => setErrors(next));
    const first = (["name", "industries", "description", "logo"] as const).find((key) => next[key] !== undefined);
    if (first === "industries") firstPill.current?.querySelector("button")?.focus();
    else if (first === "logo") logo.chooseRef.current?.focus();
    else if (first !== undefined) document.getElementById(first === "name" ? ids.name : ids.description)?.focus();
  }

  function toggleIndustry(industry: ClientIndustry) {
    if (busy.current) return;
    clearError("industries");
    setIndustries((current) =>
      current.includes(industry) ? current.filter((value) => value !== industry) : options.filter((value) => value === industry || current.includes(value)),
    );
  }

  /** Field errors from a refusal; true when the refusal was shown on a field. */
  function showRefusal(result: Extract<ActionResult<unknown>, { ok: false }>): boolean {
    const { code, fields = [] } = result.error;
    const next: Partial<Record<InfoKey, string>> = {};
    if (code === "CLIENT_NAME_TAKEN") next.name = it.clients.errors.nameTaken;
    else if (code === "CLIENT_CODE_EXHAUSTED") next.name = it.clients.errors.codeExhausted;
    else if (code === "INVALID_INPUT" && fields.length === 1 && fields[0] === "name") next.name = it.clients.errors.nameRequired;
    else if (code === "CLIENT_LOGO_INVALID") next.logo = it.clients.errors.logoUnreadable;
    else if (code === "CLIENT_FIELD_INVALID") {
      if (fields.includes("industries")) next.industries = copy.errors.required;
      if (fields.includes("description")) next.description = copy.errors.required;
      if (fields.includes("logoId")) next.logo = copy.errors.required;
    } else if (code === "CLIENT_FIELD_TOO_LONG" && fields.includes("description")) {
      next.description = fill(it.clients.errors.fieldTooLong, { max: limits.descriptionMax });
    }
    if (Object.keys(next).length === 0) return false;
    showErrors(next);
    return true;
  }

  function adopt(saved: Client, info: InfoFields) {
    clientRef.current = saved;
    savedInfo.current = info;
    if (!unmounted.current) setClient(saved);
  }

  const currentInfo = (): InfoFields => ({ name: name.trim(), industries, description: description.trim() });

  function showLogoFailure(kind: LogoFailure) {
    if (kind === "fatal") setFailed(true);
    else if (kind === "unsafe") logo.showError(it.clients.errors.logoUnsafe);
    else logo.showError(kind === "invalid" ? it.clients.errors.logoUnreadable : it.clients.errors.logoFailed);
  }

  /**
   * Saves everything, in order: create (a new client), the logo and the info, the
   * texts, then the images waiting in the browser; then opens the client's page.
   * Stays with the errors shown when a step fails.
   */
  async function save() {
    if (busy.current || !ready || images.busy) return;
    const info = currentInfo();
    const invalid: Partial<Record<InfoKey, string>> = {};
    if (info.name.length > limits.nameMax) invalid.name = fill(it.clients.errors.nameTooLong, { max: limits.nameMax });
    if (charCount(info.description) > limits.descriptionMax) {
      invalid.description = fill(it.clients.errors.fieldTooLong, { max: limits.descriptionMax });
    }
    if (Object.keys(invalid).length > 0) return showErrors(invalid);
    const overLong = BRIEF_FIELDS.find((field) => briefTooLong(brief.current()[field]));
    if (overLong !== undefined) return textareas.current[overLong]?.focus();
    const storyOver = storyOverLong();
    if (storyOver !== undefined) return storyOver?.focus();
    // A half row or a lone author would be lost on leaving: ask for the missing part first.
    if (stopAtIncomplete()) return;

    const adding = clientRef.current === null;
    busy.current = true;
    setPending(true);
    setFailed(false);
    setErrors({});
    let leavingPage = false;
    try {
      // 1. A new client: create it with its code. It is unfinished until the steps below land.
      let current = clientRef.current;
      if (current === null) {
        const created = await createClient(info);
        if (unmounted.current) return;
        if (!created.ok) {
          if (!showRefusal(created)) setFailed(true);
          return;
        }
        current = created.value;
        adopt(current, info);
        createdHere.current = true;
        // The URL names the client from now on, so a reload resumes it in the edit panel.
        window.history.replaceState(null, "", editClientPanelHref(current.id));
        panelEntry.current = { href: window.location.href, state: window.history.state };
        // The list behind the panel shows the new client even if a later step fails.
        router.refresh();
      }

      // 2. The logo (a new pick) and the other info fields.
      if (logo.logo.kind === "new") {
        let logoId: string;
        try {
          logoId = await uploadLogo(current.id);
        } catch (error) {
          showLogoFailure(error instanceof LogoStepFailed ? error.kind : "retry");
          return;
        }
        const linked = await updateClient({ clientId: current.id, ...info, logoId });
        if (!linked.ok) {
          if (!showRefusal(linked)) showLogoFailure(logoFailureOf(linked));
          return;
        }
        current = linked.value;
        adopt(current, info);
        logo.linked(logoId);
      } else if (!sameInfo(savedInfo.current, info)) {
        // No logo (a legacy client) is refused by the server as CLIENT_FIELD_INVALID on the logo.
        const updated = await updateClient({ clientId: current.id, ...info, logoId: logo.logo.kind === "current" ? logo.logo.id : null });
        if (!updated.ok) {
          if (!showRefusal(updated)) setFailed(true);
          return;
        }
        current = updated.value;
        adopt(current, info);
      }

      // 3. The texts, then the results and the testimonial (saved now on a new client; flushed on an existing one).
      const saved = await brief.flushAll();
      if (unmounted.current) return;
      if (!saved) {
        focusUnsavedText();
        return;
      }

      // 4. The images that waited in the browser (or failed before): each slot shows its own error.
      if (!(await images.uploadAll(current.id))) return;
      if (unmounted.current) return;

      leavingPage = true;
      leaving.current = true;
      // Replace: the history entry named the panel (or, after a create, the new client's edit panel).
      router.replace(clientHref(current.id), adding ? undefined : { scroll: false });
    } catch {
      setFailed(true);
    } finally {
      if (!leavingPage && !unmounted.current) {
        busy.current = false;
        setPending(false);
      }
    }
  }

  const values = brief.values;
  const missing: string[] = [
    ...(name.trim() === "" ? [copy.labels.name] : []),
    ...(industries.length === 0 ? [copy.labels.industries] : []),
    ...(description.trim() === "" ? [copy.labels.description] : []),
    ...(logo.logo.kind === "none" ? [copy.labels.logo] : []),
    ...(images.imageCount < materialLimits.minImages ? [copy.labels.images] : []),
    ...BRIEF_FIELDS.filter((field) => values[field].trim() === "").map((field) => copy.labels[field]),
  ];
  const ready = missing.length === 0;
  const inactive = !ready || pending || images.busy;

  /** Whether closing now would lose something. */
  function unsaved(): boolean {
    if (clientRef.current === null) {
      return (
        name.trim() !== "" ||
        industries.length > 0 ||
        description.trim() !== "" ||
        logo.logo.kind !== "none" ||
        images.slots.length > 0 ||
        BRIEF_FIELDS.some((field) => brief.current()[field].trim() !== "") ||
        rowsRef.current.some((row) => row.label.trim() !== "" || row.value.trim() !== "") ||
        testimonialRef.current.quote.trim() !== "" ||
        testimonialRef.current.author.trim() !== ""
      );
    }
    return (
      logo.logo.kind === "new" ||
      images.hasLocal ||
      !sameInfo(savedInfo.current, currentInfo()) ||
      brief.firstUnsaved() !== undefined ||
      firstIncomplete() !== undefined ||
      storyOverLong() !== undefined
    );
  }

  unsavedRef.current = unsaved;

  function close() {
    if (busy.current || closing || leaving.current) return;
    if (unsaved() && !window.confirm(it.wizard.unsavedConfirm)) return;
    // Discarded: pending brief text is not saved on unmount.
    discarding.current = true;
    leaving.current = true;
    setClosing(true);
    const current = clientRef.current;
    // Opened by a link: go back to the entry it came from, so no duplicate is left behind.
    if (openedInApp && !createdHere.current) router.back();
    else router.replace(current === null ? "/clients" : clientHref(current.id), { scroll: false });
  }

  const editing = client !== null;
  const descriptionCount = charCount(description.trim());
  const altName = name.trim() || client?.name || "";
  const describedBy = (...list: (string | false)[]) => list.filter(Boolean).join(" ") || undefined;
  const logoError = errors.logo ?? logo.error;
  const disabled = pending;

  const footer = (
    <div className="flex flex-col gap-3">
      {ready ? null : (
        <p id={ids.reason} className="font-label text-xs text-foreground-muted">
          {fill(copy.nextReason, { fields: missing.join(copy.listSeparator) })}
        </p>
      )}
      {/* Always mounted, so screen readers announce the generic error when it appears. */}
      <p role="alert" className="font-body text-sm text-danger empty:hidden">
        {failed ? it.clients.errors.generic : null}
      </p>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={close} className={SECONDARY_ACTION}>
          {it.clientPanel.cancel}
        </button>
        <button
          type="button"
          aria-disabled={inactive || undefined}
          aria-describedby={ready ? undefined : ids.reason}
          aria-busy={pending || undefined}
          onClick={() => void save()}
          className={cn(PRIMARY_ACTION, PRIMARY_ACTION_INACTIVE, !ready && "cursor-not-allowed", "px-5")}
        >
          {editing ? it.clientPanel.save : it.clientPanel.add}
        </button>
      </div>
    </div>
  );

  if (!wide) return null;

  return (
    <Sheet
      open={!closing}
      onClose={close}
      title={editing ? it.clientPanel.editTitle : it.clientPanel.addTitle}
      description={client === null ? it.clientPanel.addNote : fill(it.clientPanel.editNote, { code: client.code })}
      closeLabel={it.clientPanel.close}
      footer={footer}
      busy={pending}
    >
      <div className="flex flex-col gap-3">
        <FieldCard number={1} label={<SectionTitle>{it.clientPanel.sections.details}</SectionTitle>}>
          <div className="flex flex-col gap-2">
            <RequiredLabel>
              <label htmlFor={ids.name} className={FIELD_LABEL}>
                {copy.labels.name}
              </label>
            </RequiredLabel>
            <input
              id={ids.name}
              name="name"
              type="text"
              autoComplete="off"
              required
              data-autofocus
              aria-required="true"
              aria-invalid={errors.name !== undefined || undefined}
              aria-describedby={describedBy(errors.name !== undefined && ids.nameError)}
              placeholder={copy.namePlaceholder}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                clearError("name");
              }}
              className={FIELD}
            />
            {errors.name === undefined ? null : (
              <p id={ids.nameError} className={ERROR}>
                {errors.name}
              </p>
            )}
          </div>

          <div className="mt-2 flex flex-col gap-2">
            <RequiredLabel>
              <span id={ids.industriesLabel} className={FIELD_LABEL}>
                {copy.labels.industries}
              </span>
            </RequiredLabel>
            <div ref={firstPill}>
              <IndustryPills
                options={options}
                selected={industries}
                onToggle={toggleIndustry}
                labelledBy={ids.industriesLabel}
                describedBy={describedBy(ids.industriesHint, errors.industries !== undefined && ids.industriesError)}
              />
            </div>
            <p id={ids.industriesHint} className={FIELD_HINT}>
              {copy.industriesHint}
            </p>
            {errors.industries === undefined ? null : (
              <p id={ids.industriesError} className={ERROR}>
                {errors.industries}
              </p>
            )}
          </div>

          <div className="mt-2 flex flex-col gap-2">
            <div className="flex items-baseline">
              <RequiredLabel>
                <label htmlFor={ids.description} className={FIELD_LABEL}>
                  {copy.labels.description}
                </label>
              </RequiredLabel>
              <p
                id={ids.counter}
                aria-live="polite"
                className={cn(
                  "ml-auto font-mono text-xs tabular-nums",
                  descriptionCount > limits.descriptionMax ? "text-danger" : "text-foreground-muted",
                )}
              >
                {fill(copy.counter, { n: descriptionCount, max: limits.descriptionMax })}
              </p>
            </div>
            <textarea
              id={ids.description}
              name="description"
              rows={4}
              required
              aria-required="true"
              aria-invalid={errors.description !== undefined || undefined}
              aria-describedby={describedBy(ids.descriptionHint, ids.counter, errors.description !== undefined && ids.descriptionError)}
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                clearError("description");
              }}
              className={TEXTAREA}
            />
            <p id={ids.descriptionHint} className={FIELD_HINT}>
              {copy.descriptionHint}
            </p>
            {errors.description === undefined ? null : (
              <p id={ids.descriptionError} className={ERROR}>
                {errors.description}
              </p>
            )}
          </div>
        </FieldCard>

        <FieldCard number={2} label={<SectionTitle>{it.clientPanel.sections.media}</SectionTitle>}>
          <div role="group" aria-labelledby={ids.logoLabel} className="flex flex-col gap-2">
            <RequiredLabel>
              <span id={ids.logoLabel} className={FIELD_LABEL}>
                {copy.labels.logo}
              </span>
            </RequiredLabel>
            <div className="flex items-center gap-3">
              {logo.previewUrl === null ? null : (
                <LogoTile src={logo.previewUrl} alt={fill(copy.logoAlt, { name: altName })} className="size-16" />
              )}
              <input
                ref={logo.inputRef}
                type="file"
                accept={acceptFor(limits.logoTypes)}
                tabIndex={-1}
                // Reached through the logo button only: one control, one name.
                aria-hidden="true"
                onChange={(event) => {
                  clearError("logo");
                  void logo.onPick(event);
                }}
                className="sr-only"
              />
              <button
                ref={logo.chooseRef}
                type="button"
                onClick={logo.choose}
                aria-disabled={disabled || undefined}
                aria-describedby={describedBy(ids.logoHint, ids.logoReplaceHint, logoError !== null && ids.logoError)}
                className={SECONDARY_ACTION}
              >
                <ImageUp aria-hidden="true" className="size-4" />
                {logo.logo.kind === "none" ? copy.logoChoose : copy.logoReplace}
              </button>
            </div>
            <p id={ids.logoHint} className={FIELD_HINT}>
              {fill(copy.logoHint, { size: Math.round(limits.logoMaxBytes / (1024 * 1024)), px: limits.logoMinShortSide })}
            </p>
            <p id={ids.logoReplaceHint} className={FIELD_HINT}>
              {copy.logoReplaceHint}
            </p>
            {logoError === null ? null : (
              <p id={ids.logoError} className={ERROR}>
                {logoError}
              </p>
            )}
          </div>
          <div className="mt-2">
            <ClientImageSlots images={images} limits={materialLimits} disabled={disabled} />
          </div>
        </FieldCard>

        <FieldCard number={3} label={<SectionTitle>{it.clientPanel.sections.story}</SectionTitle>}>
          {BRIEF_FIELDS.map((field, index) => {
            const id = `${baseId}-${field}`;
            const errorId = `${id}-error`;
            const text = values[field];
            const over = briefTooLong(text);
            const saveFailed = brief.failed.has(field);
            const message = over ? fill(it.clients.errors.fieldTooLong, { max: limits.briefMax }) : saveFailed ? copy.errors.saveFailed : null;
            return (
              <div key={field} className={cn("flex flex-col gap-2", index > 0 && "mt-2")}>
                <RequiredLabel>
                  <label htmlFor={id} className={FIELD_LABEL}>
                    {copy.labels[field]}
                  </label>
                </RequiredLabel>
                <textarea
                  id={id}
                  ref={(element) => {
                    textareas.current[field] = element;
                  }}
                  name={field}
                  value={text}
                  required
                  aria-required="true"
                  placeholder={copy.placeholders[field]}
                  aria-invalid={over || saveFailed || undefined}
                  aria-describedby={message === null ? undefined : errorId}
                  onChange={(event) => brief.change(field, event.target.value)}
                  onBlur={() => void brief.save(field)}
                  className={TEXTAREA}
                />
                {message !== null && (
                  <p id={errorId} className={ERROR}>
                    {message}
                  </p>
                )}
              </div>
            );
          })}
          <ClientResultsFields
            baseId={baseId}
            limits={limits}
            rows={rows}
            quote={quote}
            author={author}
            onRowChange={changeRow}
            onQuoteChange={(text) => changeTestimonial({ ...testimonialRef.current, quote: text })}
            onAuthorChange={(text) => changeTestimonial({ ...testimonialRef.current, author: text })}
            onResultsBlur={() => void brief.save("results")}
            onTestimonialBlur={() => void brief.save("testimonial")}
            onLeave={reveal}
            revealed={revealed}
            resultsFailed={brief.failed.has("results")}
            testimonialFailed={brief.failed.has("testimonial")}
            inputs={storyInputs}
          />
        </FieldCard>
      </div>

      <div role="status" aria-live="polite" aria-relevant="additions" className="sr-only">
        {announcements.map((line) => (
          <p key={line.id}>{line.text}</p>
        ))}
      </div>

      {client !== null && caseCount !== null && <DeleteClientButton clientId={client.id} name={client.name} caseCount={caseCount} />}
    </Sheet>
  );
}

/** A card's section title ("01 — DETTAGLI"), a heading inside the panel. */
function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className={CARD_LABEL}>{children}</h3>;
}
