"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { createCaseStudy, saveDetailsField, updateCaseStudyDetails } from "@/app/(tool)/case-studies/actions";
import { PRIMARY_ACTION, PRIMARY_ACTION_INACTIVE } from "@/app/_components/button-styles";
import type { ActionResult } from "@/app/_lib/action-result";
import { wizardHref } from "@/app/_lib/routes";
import type { BusinessLine, ClientRef, Locale } from "@/modules/case-study";
import type { DetailsForm, FormField } from "@/modules/material";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { BusinessLinePills } from "./business-line-pills";
import { useAutosaveFields } from "./use-autosave-fields";
import { WizardFooter } from "./wizard-frame";

const copy = it.wizard.details;

/** The details-form fields in `FORM_FIELDS` order (the material module's index is server-only). */
const TEXT_FIELDS = ["context", "solution", "results"] as const satisfies readonly FormField[];

/** The fields saved on **Avanti**, named as the server's `INVALID_INPUT` names them. */
type Field = "name" | "clientId" | "year" | "locale" | "businessLine";
type FieldErrors = Partial<Record<Field, string>>;
const FIELDS: readonly Field[] = ["name", "clientId", "year", "locale", "businessLine"];

const LOCALE_OPTIONS: ReadonlyArray<{ value: Locale; label: string }> = [
  { value: "it", label: it.wizard.locales.it },
  { value: "en", label: it.wizard.locales.en },
];

/** How many live-region lines stay mounted. */
const ANNOUNCEMENTS_KEPT = 5;

const INPUT =
  "w-full rounded-md border bg-surface-control px-3 py-2 font-body text-sm text-foreground placeholder:text-foreground-muted aria-invalid:border-danger";
const LABEL = "font-label text-xs text-foreground-muted";

/** Characters as the server counts them: code points, so an emoji is one. */
const codePoints = (text: string) => [...text].length;

/** The info fields as the server holds them (what **Avanti** saves on an existing case). */
interface Info {
  name: string;
  year: number;
  locale: Locale;
  businessLine: BusinessLine | null;
}

const sameInfo = (a: Info | null, b: Info) =>
  a !== null && a.name === b.name && a.year === b.year && a.locale === b.locale && a.businessLine === b.businessLine;

/** The case being edited, as the page loaded it. */
export interface CaseDetailsCase {
  id: string;
  /** The readable code, shown in the top bar; a year change gives the draft a new one. */
  code: string;
  name: string;
  year: number;
  locale: Locale;
  /** Null for a case created before Story 2.17: **Avanti** then needs one. */
  businessLine: BusinessLine | null;
  client: ClientRef;
}

export interface CaseDetailsStepProps {
  /** The draft being edited, or null for a new case. */
  caseStudy: CaseDetailsCase | null;
  /** A new case: every client, sorted by name (`case-study.listClients`). Empty: the field gives way to a note. */
  clients: readonly ClientRef[];
  /** A client to preselect (`?clientId=` from a client's page); the page passes it only when it is in `clients`. */
  initialClientId?: string;
  /** A new case's prefilled year: the current year in Europe/Rome. */
  defaultYear: number;
  /** Accepted years (`YEAR_MIN`, `YEAR_MAX` from the case-study module). */
  yearMin: number;
  yearMax: number;
  /** `BUSINESS_LINES`, in display order. */
  businessLines: readonly BusinessLine[];
  /** The saved details form (`getDetailsForm`); all `""` for a new case. */
  initialDetails: DetailsForm;
  /** `MAX_FORM_FIELD_CHARS`, counted in code points like the server. */
  maxChars: number;
}

/** "Nessun cliente. Aggiungilo nella pagina Clienti.", with "pagina Clienti" a link to the Clients page. */
function noClientsNote() {
  const [before, after = ""] = it.wizard.noClients.split("{link}");
  return (
    <>
      {before}
      <Link href="/clients" className="text-foreground underline underline-offset-2 hover:text-foreground-strong">
        {it.wizard.noClientsLink}
      </Link>
      {after}
    </>
  );
}

/**
 * Case wizard step 1, Dettagli (Story 2.17; it replaces step 0 and the old step 2):
 * Nome, Cliente (a native select of the existing clients; fixed once the case
 * exists, since its code depends on it), Anno, Lingua, Business line (single-select
 * pills) and the optional Contesto, Soluzione and Risultati. **Avanti** is inactive
 * until Nome, Cliente, Anno and Business line are set, with the reason linked by
 * `aria-describedby`; pressing it then names each missing field and sends nothing.
 *
 * **Avanti** on a new case: `createCaseStudy` once (not idempotent: busy until the
 * request ends), then the URL names the case (`replaceState`), then the three texts
 * are saved, then step 2 opens. If a text save fails, the case stays, the field shows
 * its error, and **Avanti** retries only the texts. On an existing draft the texts
 * autosave (`useAutosaveFields`, 800 ms and on blur), and name, year, language and
 * business line save on **Avanti** (`updateCaseStudyDetails`, only when changed; a
 * year change renumbers the draft, and the next page load shows its new code); a
 * link clicked with unsaved changes saves them first and stays when a save fails.
 * When those changes can't be saved (a required field is missing), the link asks
 * "Le informazioni inserite non sono ancora salvate. Uscire comunque?" and, if
 * confirmed, leaves without them (the texts still flush). Before a new case exists,
 * nothing autosaves: a same-origin link asks the same, and a reload or tab close
 * gets the browser's leave prompt, once anything has been entered.
 */
export function CaseDetailsStep({
  caseStudy,
  clients,
  initialClientId,
  defaultYear,
  yearMin,
  yearMax,
  businessLines,
  initialDetails,
  maxChars,
}: CaseDetailsStepProps) {
  const router = useRouter();
  const baseId = useId();
  const ids = {
    name: `${baseId}-name`,
    clientId: `${baseId}-client`,
    year: `${baseId}-year`,
    locale: `${baseId}-locale`,
    businessLine: `${baseId}-business-line`,
    clientFixed: `${baseId}-client-fixed`,
    noClients: `${baseId}-no-clients`,
    reason: `${baseId}-reason`,
  };
  const errorId = (field: Field) => `${ids[field]}-error`;

  /** The case's code as last saved (a year change renumbers a draft). */
  const code = useRef(caseStudy?.code ?? "");
  /** The case's id once it exists; read synchronously by the autosave. */
  const caseRef = useRef<string | null>(caseStudy?.id ?? null);
  const [caseId, setCaseId] = useState<string | null>(caseStudy?.id ?? null);
  /** The info fields the server holds, so **Avanti** skips an unchanged save. */
  const savedInfo = useRef<Info | null>(
    caseStudy === null
      ? null
      : { name: caseStudy.name, year: caseStudy.year, locale: caseStudy.locale, businessLine: caseStudy.businessLine },
  );
  const busy = useRef(false);
  const unmounted = useRef(false);
  const pillsRef = useRef<HTMLDivElement>(null);
  const textareas = useRef<Partial<Record<FormField, HTMLTextAreaElement | null>>>({});
  const nextAnnouncement = useRef(0);

  const [name, setName] = useState(caseStudy?.name ?? "");
  const [clientId, setClientId] = useState(
    caseStudy?.client.id ??
      (initialClientId !== undefined && clients.some((client) => client.id === initialClientId) ? initialClientId : ""),
  );
  const [year, setYear] = useState(String(caseStudy?.year ?? defaultYear));
  const [locale, setLocale] = useState<Locale>(caseStudy?.locale ?? "it");
  const [businessLine, setBusinessLine] = useState<BusinessLine | null>(caseStudy?.businessLine ?? null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failed, setFailed] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [announcements, setAnnouncements] = useState<ReadonlyArray<{ id: number; text: string }>>([]);

  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
    };
  }, []);

  const fixedClient = caseStudy?.client ?? null;
  const hasClients = fixedClient !== null || clients.length > 0;
  const tooLong = (text: string) => codePoints(text) > maxChars;
  const limitMessage = fill(copy.errors.tooLong, { max: maxChars.toLocaleString("it-IT") });

  function announce(text: string) {
    if (unmounted.current) return;
    const line = { id: nextAnnouncement.current++, text };
    setAnnouncements((current) => [...current, line].slice(-ANNOUNCEMENTS_KEPT));
  }

  const parsedYear = () => (/^\d+$/.test(year.trim()) ? Number(year.trim()) : Number.NaN);
  const currentInfo = (): Info => ({ name: name.trim(), year: parsedYear(), locale, businessLine });
  const yearValid = (value: number) => Number.isInteger(value) && value >= yearMin && value <= yearMax;
  const initialClient = useRef(clientId);

  /** A new case with something entered: leaving would lose it (nothing autosaves before the case exists). */
  const hasUnsavedNewCase = () =>
    caseRef.current === null &&
    (name.trim() !== "" ||
      businessLine !== null ||
      clientId !== initialClient.current ||
      year !== String(defaultYear) ||
      locale !== "it" ||
      TEXT_FIELDS.some((field) => texts.current()[field] !== ""));
  const unsavedNewCaseRef = useRef(hasUnsavedNewCase);
  useEffect(() => {
    unsavedNewCaseRef.current = hasUnsavedNewCase;
  });

  // Before the case exists, a same-origin link or a reload with something entered asks first.
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || (anchor.target !== "" && anchor.target !== "_self")) return;
      if (anchor.origin !== window.location.origin || anchor.hasAttribute("download")) return;
      if (!unsavedNewCaseRef.current()) return;
      if (window.confirm(it.wizard.unsavedConfirm)) return;
      event.preventDefault();
      event.stopPropagation();
    }
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!unsavedNewCaseRef.current()) return;
      event.preventDefault();
      // Older browsers need a value; they show their own text.
      event.returnValue = "";
    }
    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);

  const texts = useAutosaveFields<FormField>({
    fields: TEXT_FIELDS,
    initial: initialDetails,
    save: async (field, text) => {
      const id = caseRef.current;
      if (id === null) return false;
      return (await saveDetailsField({ caseId: id, field, text })).ok;
    },
    tooLong,
    active: () => caseRef.current !== null,
    onSaveFailed: (field) => announce(fill(copy.announceError, { field: copy.labels[field], message: copy.errors.saveFailed })),
    // Name, year, language or business line not saved yet also hold a link back.
    hasOtherUnsaved: () => !sameInfo(savedInfo.current, currentInfo()),
    onUnsavedLink: (href) => void saveAndGo(href, { requireReady: false }),
  });

  const messageFor: Record<Field, string> = {
    name: it.wizard.errors.name,
    clientId: it.wizard.errors.client,
    year: fill(it.wizard.errors.year, { min: yearMin, max: yearMax }),
    locale: it.wizard.errors.locale,
    businessLine: it.wizard.errors.businessLine,
  };

  function show(next: FieldErrors) {
    // Commit the messages (aria-invalid, aria-describedby) before focus moves, so they are announced.
    flushSync(() => setErrors(next));
    const first = FIELDS.find((field) => next[field] !== undefined);
    if (first === "businessLine") pillsRef.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus();
    else if (first !== undefined) document.getElementById(ids[first])?.focus();
  }

  function clearError(field: Field) {
    setErrors((current) => {
      if (current[field] === undefined) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  /** The fields **Avanti** needs that are still empty. */
  function missingFields(): FieldErrors {
    const missing: FieldErrors = {};
    if (name.trim() === "") missing.name = messageFor.name;
    // With no clients there is no field to name: the note already says why.
    if (clientId === "" && hasClients) missing.clientId = messageFor.clientId;
    if (year.trim() === "") missing.year = messageFor.year;
    if (businessLine === null) missing.businessLine = messageFor.businessLine;
    return missing;
  }

  /** Field messages for an `INVALID_INPUT`; true when every named field is on the form. */
  function showInvalid(result: Extract<ActionResult<unknown>, { ok: false }>): boolean {
    const fields = result.error.code === "INVALID_INPUT" ? (result.error.fields ?? []) : [];
    const known = fields.filter((field): field is Field => (FIELDS as readonly string[]).includes(field));
    if (known.length > 0) show(Object.fromEntries(known.map((field) => [field, messageFor[field]])));
    return known.length > 0 && known.length === fields.length;
  }

  /**
   * Saves everything (create on a new case, else the changed info fields, then the
   * texts) and goes to `href`; stays with the errors shown when a step fails.
   * **Avanti** needs every required field (`requireReady`); a link clicked on an
   * existing case saves what it can and lets the server name what is missing.
   */
  async function saveAndGo(href: string | ((id: string) => string), { requireReady }: { requireReady: boolean }) {
    if (busy.current) return;
    const info = currentInfo();
    // A link on an existing case whose info edits can't be saved (a required field is
    // missing or the year is out of range): ask, then leave without them (texts still flush).
    let discardInfo = false;
    if (!requireReady && caseRef.current !== null && !sameInfo(savedInfo.current, info)) {
      const cannotSave = Object.keys(missingFields()).length > 0 || !yearValid(info.year);
      if (cannotSave) {
        if (!window.confirm(it.wizard.unsavedConfirm)) return;
        discardInfo = true;
      }
    }
    if (requireReady) {
      const missing = missingFields();
      if (Object.keys(missing).length > 0 || !hasClients) {
        setFailed(null);
        show(missing);
        return;
      }
    }
    if (!discardInfo && !yearValid(info.year)) {
      setFailed(null);
      show({ year: messageFor.year });
      return;
    }
    const overLong = TEXT_FIELDS.find((field) => tooLong(texts.current()[field]));
    if (overLong !== undefined) {
      textareas.current[overLong]?.focus();
      return;
    }

    busy.current = true;
    setPending(true);
    setFailed(null);
    setErrors({});
    let leaving = false;
    let renumbered = false;
    const creating = caseRef.current === null;
    try {
      let id = caseRef.current;
      if (id === null) {
        // 1. A new case: create it with its code and business line.
        if (info.businessLine === null) return;
        const created = await createCaseStudy({ ...info, businessLine: info.businessLine, clientId });
        // Left meanwhile: the URL now belongs to another page.
        if (unmounted.current) return;
        if (!created.ok) {
          if (created.error.code === "CLIENT_NOT_FOUND") {
            // A stale list: retrying the same pick fails again, so say so on the field.
            show({ clientId: it.wizard.errors.clientNotFound });
            return;
          }
          if (!showInvalid(created)) setFailed(it.wizard.errors.generic);
          return;
        }
        id = created.value.id;
        caseRef.current = id;
        savedInfo.current = info;
        setCaseId(id);
        // The URL names the case from now on, so a reload resumes it instead of creating another.
        window.history.replaceState(null, "", wizardHref(id, 1));
      } else if (!discardInfo && !sameInfo(savedInfo.current, info)) {
        // 1. An existing case: save the changed info fields.
        const updated = await updateCaseStudyDetails({ caseId: id, ...info });
        if (unmounted.current) return;
        if (!updated.ok) {
          if (updated.error.code === "NOT_FOUND" || updated.error.code === "STALE_STATUS") setFailed(it.wizard.errors.notDraft);
          else if (!showInvalid(updated)) setFailed(it.wizard.errors.saveFailed);
          return;
        }
        savedInfo.current = info;
        // A year change renumbers the draft (owner, 2026-10-20): the top bar must show the new code.
        renumbered = updated.value.code !== code.current;
        code.current = updated.value.code;
      }

      // 2. The three texts (saved now on a new case; flushed on an existing one).
      const saved = await texts.flushAll();
      if (unmounted.current) return;
      if (!saved) {
        const unsaved = texts.firstUnsaved();
        if (unsaved !== undefined) textareas.current[unsaved]?.focus();
        return;
      }

      leaving = true;
      router.push(typeof href === "string" ? href : href(id));
    } catch {
      if (!unmounted.current) setFailed(creating && caseRef.current === null ? it.wizard.errors.generic : it.wizard.errors.saveFailed);
    } finally {
      // After success the button stays busy until the wizard shows step 2.
      if (!leaving && !unmounted.current) {
        busy.current = false;
        setPending(false);
        // Staying after a renumber (a text failed to save): reload the page data for the new code.
        if (renumbered) router.refresh();
      }
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveAndGo((id) => wizardHref(id, 2), { requireReady: true });
  }

  const missingLabels = [
    ...(name.trim() === "" ? [it.wizard.fields.name] : []),
    ...(clientId === "" ? [it.wizard.fields.client] : []),
    ...(year.trim() === "" ? [it.wizard.fields.year] : []),
    ...(businessLine === null ? [it.wizard.fields.businessLine] : []),
  ];
  const ready = missingLabels.length === 0 && hasClients;
  const values = texts.values;
  const filled = TEXT_FIELDS.filter((field) => values[field].trim() !== "").length;

  const describedBy = (...list: (string | false | undefined)[]) => list.filter(Boolean).join(" ") || undefined;
  const fieldError = (field: Field) =>
    errors[field] === undefined ? null : (
      <p id={errorId(field)} className="font-label text-xs text-danger">
        {errors[field]}
      </p>
    );
  const errorOf = (field: Field) => errors[field] !== undefined && errorId(field);
  const reasonStart = !hasClients ? undefined : !ready ? (
    <span id={ids.reason}>{fill(it.wizard.nextReason, { fields: missingLabels.join(it.wizard.listSeparator) })}</span>
  ) : (
    <span className="font-mono">{fill(copy.counter, { n: filled })}</span>
  );

  return (
    <form noValidate onSubmit={onSubmit} aria-busy={pending || undefined}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-4">
        <div className="col-span-2 flex flex-col gap-1.5">
          <label htmlFor={ids.name} className={LABEL}>
            {it.wizard.fields.name}
          </label>
          <input
            id={ids.name}
            name="name"
            type="text"
            autoComplete="off"
            required
            aria-required="true"
            aria-invalid={errors.name !== undefined || undefined}
            aria-describedby={describedBy(errorOf("name"))}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              clearError("name");
            }}
            className={INPUT}
          />
          {fieldError("name")}
        </div>

        <div className="col-span-2 flex flex-col gap-1.5">
          {caseId !== null ? (
            <>
              <label htmlFor={ids.clientId} className={LABEL}>
                {it.wizard.fields.client}
              </label>
              <input
                id={ids.clientId}
                name="client"
                type="text"
                readOnly
                aria-describedby={ids.clientFixed}
                value={(() => {
                  const client = fixedClient ?? clients.find((option) => option.id === clientId);
                  return client === undefined ? "" : fill(it.wizard.clientOption, { name: client.name, code: client.code });
                })()}
                className={cn(INPUT, "text-foreground-muted")}
              />
              <p id={ids.clientFixed} className={LABEL}>
                {it.wizard.clientFixed}
              </p>
            </>
          ) : hasClients ? (
            <>
              <label htmlFor={ids.clientId} className={LABEL}>
                {it.wizard.fields.client}
              </label>
              <select
                id={ids.clientId}
                name="clientId"
                required
                aria-required="true"
                aria-invalid={errors.clientId !== undefined || undefined}
                aria-describedby={describedBy(errorOf("clientId"))}
                value={clientId}
                onChange={(event) => {
                  setClientId(event.target.value);
                  clearError("clientId");
                }}
                className={INPUT}
              >
                <option value="">{it.wizard.clientPlaceholder}</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {fill(it.wizard.clientOption, { name: client.name, code: client.code })}
                  </option>
                ))}
              </select>
              {fieldError("clientId")}
            </>
          ) : (
            <>
              <span className={LABEL}>{it.wizard.fields.client}</span>
              <p id={ids.noClients} className="font-body text-sm text-foreground">
                {noClientsNote()}
              </p>
            </>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.year} className={LABEL}>
            {it.wizard.fields.year}
          </label>
          <input
            id={ids.year}
            name="year"
            type="number"
            inputMode="numeric"
            min={yearMin}
            max={yearMax}
            step={1}
            required
            aria-required="true"
            aria-invalid={errors.year !== undefined || undefined}
            aria-describedby={describedBy(errorOf("year"))}
            value={year}
            onChange={(event) => {
              setYear(event.target.value);
              clearError("year");
            }}
            className={cn(INPUT, "tabular-nums")}
          />
          {fieldError("year")}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.locale} className={LABEL}>
            {it.wizard.fields.locale}
          </label>
          <select
            id={ids.locale}
            name="locale"
            aria-invalid={errors.locale !== undefined || undefined}
            aria-describedby={describedBy(errorOf("locale"))}
            value={locale}
            onChange={(event) => {
              setLocale(event.target.value as Locale);
              clearError("locale");
            }}
            className={INPUT}
          >
            {LOCALE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {fieldError("locale")}
        </div>

        <div className="col-span-2 flex flex-col gap-1.5">
          <span id={ids.businessLine} className={LABEL}>
            {it.wizard.fields.businessLine}
          </span>
          <div ref={pillsRef}>
            <BusinessLinePills
              options={businessLines}
              selected={businessLine}
              onSelect={(picked) => {
                setBusinessLine(picked);
                clearError("businessLine");
              }}
              labelledBy={ids.businessLine}
              describedBy={describedBy(errorOf("businessLine"))}
              invalid={errors.businessLine !== undefined}
              disabled={pending}
            />
          </div>
          {fieldError("businessLine")}
        </div>
      </div>

      <h2 className="mt-10 mb-6 font-heading text-xl font-medium text-foreground-strong">{copy.heading}</h2>

      <div className="flex flex-col gap-5">
        {TEXT_FIELDS.map((field) => {
          const id = `${baseId}-${field}`;
          const textErrorId = `${id}-error`;
          const text = values[field];
          const over = tooLong(text);
          const atLimit = codePoints(text) >= maxChars;
          const saveFailed = texts.failed.has(field);
          const message = over ? limitMessage : saveFailed ? copy.errors.saveFailed : atLimit ? limitMessage : null;
          return (
            <div key={field} className="flex flex-col gap-1.5">
              <label htmlFor={id} className={LABEL}>
                {copy.labels[field]}
              </label>
              <textarea
                id={id}
                ref={(element) => {
                  textareas.current[field] = element;
                }}
                name={field}
                value={text}
                placeholder={copy.placeholders[field]}
                aria-invalid={over || saveFailed || undefined}
                aria-describedby={message === null ? undefined : textErrorId}
                onChange={(event) => texts.change(field, event.target.value)}
                onBlur={() => void texts.save(field)}
                className="min-h-[120px] w-full resize-y rounded-md border border-transparent bg-surface-control p-3 font-body text-sm text-foreground placeholder:text-foreground-muted"
              />
              {message !== null && (
                <p id={textErrorId} className={cn("font-label text-xs", over || saveFailed ? "text-danger" : "text-foreground-muted")}>
                  {message}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Always mounted, so screen readers announce the error line when it appears. */}
      <div role="alert" className="mt-6 font-body text-sm text-danger empty:hidden">
        {failed}
      </div>

      <div role="status" aria-live="polite" aria-relevant="additions" className="sr-only">
        {announcements.map((line) => (
          <p key={line.id}>{line.text}</p>
        ))}
      </div>

      <WizardFooter
        current={1}
        start={reasonStart}
        action={
          <button
            type="submit"
            aria-disabled={!ready || pending}
            aria-describedby={!hasClients ? ids.noClients : ready ? undefined : ids.reason}
            aria-busy={pending || undefined}
            className={cn(PRIMARY_ACTION, PRIMARY_ACTION_INACTIVE, !ready && "cursor-not-allowed", "px-[18px] py-2.5")}
          >
            {it.wizard.next}
          </button>
        }
      />
    </form>
  );
}
