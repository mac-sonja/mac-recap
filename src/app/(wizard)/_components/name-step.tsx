"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { createCaseStudy } from "@/app/(tool)/case-studies/actions";
import { PRIMARY_ACTION, PRIMARY_ACTION_INACTIVE } from "@/app/_components/button-styles";
import { wizardHref } from "@/app/_lib/routes";
import type { Locale } from "@/modules/case-study";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { WizardFooter } from "./wizard-frame";

export interface NameStepProps {
  /** Prefilled year: the current year in Europe/Rome. */
  defaultYear: number;
  /** Accepted years (`YEAR_MIN`, `YEAR_MAX` from the case-study module). */
  yearMin: number;
  yearMax: number;
}

type Field = "name" | "client" | "year" | "locale";
type FieldErrors = Partial<Record<Field, string>>;

const FIELDS: readonly Field[] = ["name", "client", "year", "locale"];
const LOCALE_OPTIONS: ReadonlyArray<{ value: Locale; label: string }> = [
  { value: "it", label: it.wizard.locales.it },
  { value: "en", label: it.wizard.locales.en },
];

const INPUT =
  "w-full rounded-md border bg-surface-control px-3 py-2 font-body text-sm text-foreground placeholder:text-foreground-muted aria-invalid:border-danger";

/**
 * Step 0: name and client (required), year (prefilled, editable) and narrative
 * language (*Italiano* default). **Avanti** stays inactive while name or client is
 * blank; pressing it then sends nothing and names each missing field. Otherwise it
 * calls `createCaseStudy` once (create is not idempotent: the button is busy until
 * the request ends, and stays busy while the wizard moves on), then replaces the
 * URL with `?caseId=`. Server `INVALID_INPUT` fields map to their Italian messages;
 * any other failure, or a field the form doesn't have, keeps the form filled and
 * shows one generic line.
 */
export function NameStep({ defaultYear, yearMin, yearMax }: NameStepProps) {
  const router = useRouter();
  const ids = { name: useId(), client: useId(), year: useId(), locale: useId() };
  const errorId = (field: Field) => `${ids[field]}-error`;
  const inFlight = useRef(false);

  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [year, setYear] = useState(String(defaultYear));
  const [locale, setLocale] = useState<Locale>("it");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);

  const ready = name.trim() !== "" && client.trim() !== "";
  const yearMessage = fill(it.wizard.errors.year, { min: yearMin, max: yearMax });
  const messageFor: Record<Field, string> = {
    name: it.wizard.errors.name,
    client: it.wizard.errors.client,
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
    if (client.trim() === "") missing.client = messageFor.client;
    if (!Number.isInteger(parsedYear) || parsedYear < yearMin || parsedYear > yearMax) missing.year = messageFor.year;
    if (Object.keys(missing).length > 0) {
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
      const result = await createCaseStudy({ name: name.trim(), client: client.trim(), year: parsedYear, locale });
      if (result.ok) {
        moved = true;
        router.replace(wizardHref(result.value.id));
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
          <label htmlFor={ids.client} className={label}>
            {it.wizard.fields.client}
          </label>
          <input
            id={ids.client}
            name="client"
            type="text"
            autoComplete="off"
            required
            aria-required="true"
            aria-invalid={errors.client !== undefined || undefined}
            aria-describedby={describedBy("client")}
            value={client}
            onChange={(event) => {
              setClient(event.target.value);
              clearError("client");
            }}
            className={INPUT}
          />
          {fieldError("client")}
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
            aria-disabled={!ready || pending}
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
