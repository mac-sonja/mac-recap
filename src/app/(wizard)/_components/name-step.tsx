"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { createCaseStudy } from "@/app/(tool)/case-studies/actions";
import { PRIMARY_ACTION, PRIMARY_ACTION_INACTIVE } from "@/app/_components/button-styles";
import { wizardHref } from "@/app/_lib/routes";
import type { ClientRef, Locale } from "@/modules/case-study";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { WizardFooter } from "./wizard-frame";

export interface NameStepProps {
  /** Every client, sorted by name (`case-study.listClients`). Empty: the field gives way to a note. */
  clients: readonly ClientRef[];
  /** A client to preselect (`?clientId=` from a client's page); the page passes it only when it is in `clients`. */
  initialClientId?: string;
  /** Prefilled year: the current year in Europe/Rome. */
  defaultYear: number;
  /** Accepted years (`YEAR_MIN`, `YEAR_MAX` from the case-study module). */
  yearMin: number;
  yearMax: number;
}

/** Form fields, named as the server's `INVALID_INPUT` names them. */
type Field = "name" | "clientId" | "year" | "locale";
type FieldErrors = Partial<Record<Field, string>>;

const FIELDS: readonly Field[] = ["name", "clientId", "year", "locale"];
const LOCALE_OPTIONS: ReadonlyArray<{ value: Locale; label: string }> = [
  { value: "it", label: it.wizard.locales.it },
  { value: "en", label: it.wizard.locales.en },
];

const INPUT =
  "w-full rounded-md border bg-surface-control px-3 py-2 font-body text-sm text-foreground placeholder:text-foreground-muted aria-invalid:border-danger";

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
 * Step 0: name (required), client (required, picked from a native select of the
 * existing clients, "{name} ({code})", empty first option; no free text and no
 * adding here), year (prefilled, editable) and narrative language (*Italiano*
 * default). A client named by `initialClientId` starts selected. With no clients
 * the select gives way to "Nessun cliente…" (linking to the Clients page) and
 * **Avanti** stays inactive. **Avanti** is inactive while the name is blank or no
 * client is picked; pressing it then sends nothing and names each missing field.
 * Otherwise it calls `createCaseStudy({ name, clientId, year, locale })` once (create is not idempotent: the button is busy until
 * the request ends, and stays busy while the wizard moves on), then replaces the
 * URL with `?caseId=`. Server `INVALID_INPUT` fields map to their Italian messages,
 * and `CLIENT_NOT_FOUND` (a stale list) to a reload message on the client field;
 * any other failure, or a field the form doesn't have, keeps the form filled and
 * shows one generic line.
 */
export function NameStep({ clients, initialClientId, defaultYear, yearMin, yearMax }: NameStepProps) {
  const router = useRouter();
  const ids = { name: useId(), clientId: useId(), year: useId(), locale: useId() };
  const noClientsId = useId();
  const hasClients = clients.length > 0;
  const errorId = (field: Field) => `${ids[field]}-error`;
  const inFlight = useRef(false);

  const [name, setName] = useState("");
  const [clientId, setClientId] = useState(
    initialClientId !== undefined && clients.some((client) => client.id === initialClientId) ? initialClientId : "",
  );
  const [year, setYear] = useState(String(defaultYear));
  const [locale, setLocale] = useState<Locale>("it");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);

  const ready = name.trim() !== "" && clientId !== "";
  const yearMessage = fill(it.wizard.errors.year, { min: yearMin, max: yearMax });
  const messageFor: Record<Field, string> = {
    name: it.wizard.errors.name,
    clientId: it.wizard.errors.client,
    year: yearMessage,
    locale: it.wizard.errors.locale,
  };

  function show(next: FieldErrors) {
    // Commit the messages (aria-invalid, aria-describedby) before focus moves, so they are announced.
    flushSync(() => setErrors(next));
    const first = FIELDS.find((field) => next[field] !== undefined);
    if (first !== undefined) document.getElementById(ids[first])?.focus();
  }

  function clearError(field: Field) {
    setErrors((current) => {
      if (current[field] === undefined) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;

    const parsedYear = /^\d+$/.test(year.trim()) ? Number(year.trim()) : Number.NaN;
    const missing: FieldErrors = {};
    if (name.trim() === "") missing.name = messageFor.name;
    // With no clients there is no field to name: the note already says why.
    if (clientId === "" && hasClients) missing.clientId = messageFor.clientId;
    if (!Number.isInteger(parsedYear) || parsedYear < yearMin || parsedYear > yearMax) missing.year = messageFor.year;
    if (Object.keys(missing).length > 0 || !hasClients) {
      setFailed(false);
      show(missing);
      return;
    }

    inFlight.current = true;
    setPending(true);
    setFailed(false);
    setErrors({});
    let moved = false;
    try {
      const result = await createCaseStudy({ name: name.trim(), clientId, year: parsedYear, locale });
      if (result.ok) {
        moved = true;
        router.replace(wizardHref(result.value.id));
        return;
      }
      if (result.error.code === "CLIENT_NOT_FOUND") {
        // A stale list: retrying the same pick fails again, so say so on the field.
        setFailed(false);
        show({ clientId: it.wizard.errors.clientNotFound });
        return;
      }
      const fields = result.error.code === "INVALID_INPUT" ? (result.error.fields ?? []) : [];
      const known = fields.filter((field): field is Field => (FIELDS as readonly string[]).includes(field));
      // Any failure that no field message explains also gets the generic line.
      setFailed(known.length === 0 || known.length < fields.length);
      if (known.length > 0) show(Object.fromEntries(known.map((field) => [field, messageFor[field]])));
    } catch {
      setFailed(true);
    } finally {
      // After success the button stays busy until the wizard shows step 1.
      if (!moved) {
        inFlight.current = false;
        setPending(false);
      }
    }
  }

  const describedBy = (field: Field) => (errors[field] === undefined ? undefined : errorId(field));
  const label = "font-label text-xs text-foreground-muted";
  const fieldError = (field: Field) =>
    errors[field] === undefined ? null : (
      <p id={errorId(field)} className="font-label text-xs text-danger">
        {errors[field]}
      </p>
    );

  return (
    <form noValidate onSubmit={onSubmit} aria-busy={pending || undefined}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-4">
        <div className="col-span-2 flex flex-col gap-1.5">
          <label htmlFor={ids.name} className={label}>
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
            aria-describedby={describedBy("name")}
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
          {hasClients ? (
            <>
              <label htmlFor={ids.clientId} className={label}>
                {it.wizard.fields.client}
              </label>
              <select
                id={ids.clientId}
                name="clientId"
                required
                aria-required="true"
                aria-invalid={errors.clientId !== undefined || undefined}
                aria-describedby={describedBy("clientId")}
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
              <span className={label}>{it.wizard.fields.client}</span>
              <p id={noClientsId} className="font-body text-sm text-foreground">
                {noClientsNote()}
              </p>
            </>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.year} className={label}>
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
            aria-describedby={describedBy("year")}
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
          <label htmlFor={ids.locale} className={label}>
            {it.wizard.fields.locale}
          </label>
          <select
            id={ids.locale}
            name="locale"
            aria-invalid={errors.locale !== undefined || undefined}
            aria-describedby={describedBy("locale")}
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
      </div>

      {/* Always mounted, so screen readers announce the generic error when it appears. */}
      <div role="alert" className="mt-6 font-body text-sm text-danger empty:hidden">
        {failed ? it.wizard.errors.generic : null}
      </div>

      <WizardFooter
        current={0}
        action={
          <button
            type="submit"
            aria-disabled={!ready || !hasClients || pending}
            aria-describedby={hasClients ? undefined : noClientsId}
            aria-busy={pending || undefined}
            className={cn(PRIMARY_ACTION, PRIMARY_ACTION_INACTIVE, "px-[18px] py-2.5")}
          >
            {it.wizard.next}
          </button>
        }
      />
    </form>
  );
}
