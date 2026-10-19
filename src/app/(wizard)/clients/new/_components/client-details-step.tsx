"use client";

import { ImageUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { PRIMARY_ACTION, PRIMARY_ACTION_INACTIVE } from "@/app/_components/button-styles";
import type { ActionResult } from "@/app/_lib/action-result";
import { clientWizardHref } from "@/app/_lib/routes";
import { createClient, saveClientBriefField, updateClient } from "@/app/(tool)/clients/actions";
import { LogoTile } from "@/app/(tool)/clients/_components/logo-tile";
import { LogoStepFailed, logoFailureOf, useClientLogo, type LogoFailure } from "@/app/(tool)/clients/_components/use-client-logo";
import type { ClientLimits } from "@/app/(tool)/clients/_lib/client-limits";
import { acceptFor } from "@/app/(wizard)/_lib/upload";
import { useAutosaveFields } from "@/app/(wizard)/_components/use-autosave-fields";
import { WizardFooter } from "@/app/(wizard)/_components/wizard-frame";
import type { Client, ClientBrief, ClientBriefField, ClientDetail, ClientIndustry } from "@/modules/case-study";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { CLIENT_WIZARD_STEPS } from "./client-steps";
import { IndustryPills } from "@/app/(tool)/clients/_components/industry-pills";

const copy = it.clientWizard.details;

/** The brief fields in `CLIENT_BRIEF_FIELDS` order (the module's index is server-only). */
const BRIEF_FIELDS = ["context", "solution", "results"] as const satisfies readonly ClientBriefField[];

/** The fields saved on **Avanti** (the brief autosaves). */
type InfoKey = "name" | "industries" | "description" | "logo";

interface InfoFields {
  name: string;
  industries: ClientIndustry[];
  description: string;
}

/** How many live-region lines stay mounted. */
const ANNOUNCEMENTS_KEPT = 5;

const INPUT =
  "w-full rounded-md border bg-surface-control px-3 py-2 font-body text-sm text-foreground placeholder:text-foreground-muted aria-invalid:border-danger";
const SECONDARY =
  "inline-flex items-center gap-2 rounded-md bg-surface-control px-3 py-2 font-label text-sm text-foreground hover:bg-surface-selected";
const LABEL = "font-label text-xs text-foreground-muted";
const ERROR = "font-label text-xs text-danger";

/** Characters as the server counts them: code points, so an emoji is one. */
const charCount = (text: string) => [...text].length;

const sameInfo = (a: InfoFields | null, b: InfoFields) =>
  a !== null &&
  a.name === b.name &&
  a.description === b.description &&
  a.industries.length === b.industries.length &&
  a.industries.every((industry, index) => industry === b.industries[index]);

export interface ClientDetailsStepProps {
  /** The client being edited (with its brief), or null to add one. */
  client: ClientDetail | null;
  /** `CLIENT_INDUSTRIES`, in display order. */
  industries: readonly ClientIndustry[];
  limits: ClientLimits;
}

/**
 * Client wizard step 1, Dettagli (Story 2.15): Nome, Settore (pills, multiselect),
 * Descrizione (live counter), Logo (preview, replace) and Contesto, Soluzione,
 * Risultati (textareas with one-line prompts). Every field is required: **Avanti**
 * stays inactive until all are filled, with the reason linked by `aria-describedby`.
 * Lengths are checked here first (inline error, no request).
 *
 * **Avanti** on a new client: `createClient` (name, industries, description; the
 * code is assigned), then the logo (presign → PUT → confirm → `updateClient` links
 * it), then the three texts, then step 2. If a later step fails, the client stays
 * (unfinished), the URL names it, the error shows, and **Avanti** retries only what
 * is left (a confirmed logo is re-linked, not uploaded again). On an existing client
 * the three texts autosave (`useAutosaveFields`, as in the case Details step), and
 * name, industries, description and a new logo save on **Avanti**.
 */
export function ClientDetailsStep({ client: initialClient, industries: options, limits }: ClientDetailsStepProps) {
  const router = useRouter();
  const baseId = useId();
  const ids = {
    name: `${baseId}-name`,
    nameError: `${baseId}-name-error`,
    industriesLabel: `${baseId}-industries-label`,
    industriesHint: `${baseId}-industries-hint`,
    industriesError: `${baseId}-industries-error`,
    description: `${baseId}-description`,
    counter: `${baseId}-description-counter`,
    descriptionError: `${baseId}-description-error`,
    logoInput: `${baseId}-logo`,
    logoHint: `${baseId}-logo-hint`,
    logoError: `${baseId}-logo-error`,
    reason: `${baseId}-reason`,
  };

  /** The client as last saved; null until an add has created it. Read synchronously by the autosave. */
  const clientRef = useRef<Client | null>(initialClient);
  const [client, setClient] = useState<Client | null>(initialClient);
  /** The info fields the server holds, so Avanti skips an unchanged save. */
  const savedInfo = useRef<InfoFields | null>(
    initialClient === null
      ? null
      : { name: initialClient.name, industries: [...initialClient.industries], description: initialClient.description ?? "" },
  );
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<InfoKey, string>>>({});
  const [announcements, setAnnouncements] = useState<ReadonlyArray<{ id: number; text: string }>>([]);
  const nextAnnouncement = useRef(0);
  const unmounted = useRef(false);
  const textareas = useRef<Partial<Record<ClientBriefField, HTMLTextAreaElement | null>>>({});
  const firstPill = useRef<HTMLDivElement>(null);

  const [name, setName] = useState(initialClient?.name ?? "");
  const [industries, setIndustries] = useState<ClientIndustry[]>(() => [...(initialClient?.industries ?? [])]);
  const [description, setDescription] = useState(initialClient?.description ?? "");

  const logo = useClientLogo(limits, { logoId: initialClient?.logoId ?? null, logoUrl: initialClient?.logoUrl ?? null }, () => busy.current);

  const briefTooLong = (text: string) => charCount(text.trim()) > limits.briefMax;
  const initialBrief: ClientBrief = initialClient?.brief ?? { context: "", solution: "", results: "" };

  function announce(text: string) {
    if (unmounted.current) return;
    const line = { id: nextAnnouncement.current++, text };
    setAnnouncements((current) => [...current, line].slice(-ANNOUNCEMENTS_KEPT));
  }

  const brief = useAutosaveFields<ClientBriefField>({
    fields: BRIEF_FIELDS,
    initial: initialBrief,
    save: async (field, text) => {
      const current = clientRef.current;
      if (current === null) return false;
      return (await saveClientBriefField({ clientId: current.id, field, text })).ok;
    },
    tooLong: briefTooLong,
    active: () => clientRef.current !== null,
    onSaveFailed: (field) => announce(fill(copy.announceError, { field: copy.labels[field], message: copy.errors.saveFailed })),
    // Name, industries, description or a new logo not saved yet also hold a link back.
    hasOtherUnsaved: () => logo.logo.kind === "new" || !sameInfo(savedInfo.current, currentInfo()),
    // A link clicked with unsaved changes: save them as Avanti does, then follow it; stay when a save failed.
    onUnsavedLink: (href) => void saveAndGo(href, { requireReady: false }),
  });

  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
    };
  }, []);

  function focusUnsavedText() {
    const unsaved = brief.firstUnsaved();
    if (unsaved !== undefined) textareas.current[unsaved]?.focus();
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

  /**
   * Saves everything (create on a new client, then the logo and info, then the
   * texts) and goes to `href`; stays with the errors shown when a step fails.
   * Avanti needs every field filled (`requireReady`); a link clicked on an existing
   * client saves what it can and lets the server name what is missing.
   */
  async function saveAndGo(href: string | ((clientId: string) => string), { requireReady }: { requireReady: boolean }) {
    if (busy.current || (requireReady && !ready)) return;
    const info = currentInfo();
    const invalid: Partial<Record<InfoKey, string>> = {};
    if (info.name.length > limits.nameMax) invalid.name = fill(it.clients.errors.nameTooLong, { max: limits.nameMax });
    if (charCount(info.description) > limits.descriptionMax) {
      invalid.description = fill(it.clients.errors.fieldTooLong, { max: limits.descriptionMax });
    }
    if (Object.keys(invalid).length > 0) return showErrors(invalid);
    const overLong = BRIEF_FIELDS.find((field) => briefTooLong(brief.current()[field]));
    if (overLong !== undefined) return textareas.current[overLong]?.focus();

    busy.current = true;
    setPending(true);
    setFailed(false);
    setErrors({});
    let leaving = false;
    try {
      // 1. A new client: create it with its code. It is unfinished until the steps below land.
      let current = clientRef.current;
      if (current === null) {
        const created = await createClient(info);
        // Left meanwhile: the URL now belongs to another page.
        if (unmounted.current) return;
        if (!created.ok) {
          if (!showRefusal(created)) setFailed(true);
          return;
        }
        current = created.value;
        adopt(current, info);
        // The URL names the client from now on, so a reload resumes it instead of adding another.
        window.history.replaceState(null, "", clientWizardHref(current.id));
      }

      // 2. The logo (a new pick) and the other info fields.
      if (logo.logo.kind === "new") {
        let logoId: string;
        try {
          logoId = await logo.upload(current.id);
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

      // 3. The three texts (saved now on a new client; flushed on an existing one).
      const saved = await brief.flushAll();
      if (unmounted.current) return;
      if (!saved) {
        focusUnsavedText();
        return;
      }

      leaving = true;
      router.push(typeof href === "string" ? href : href(current.id));
    } catch {
      setFailed(true);
    } finally {
      if (!leaving && !unmounted.current) {
        busy.current = false;
        setPending(false);
      }
    }
  }

  function showLogoFailure(kind: LogoFailure) {
    if (kind === "fatal") setFailed(true);
    else logo.showError(kind === "invalid" ? it.clients.errors.logoUnreadable : it.clients.errors.logoFailed);
  }

  const values = brief.values;
  const missing: string[] = [
    ...(name.trim() === "" ? [copy.labels.name] : []),
    ...(industries.length === 0 ? [copy.labels.industries] : []),
    ...(description.trim() === "" ? [copy.labels.description] : []),
    ...(logo.logo.kind === "none" ? [copy.labels.logo] : []),
    ...BRIEF_FIELDS.filter((field) => values[field].trim() === "").map((field) => copy.labels[field]),
  ];
  const ready = missing.length === 0;
  const inactive = !ready || pending;

  const descriptionCount = charCount(description.trim());
  const altName = name.trim() || client?.name || "";
  const describedBy = (...list: (string | false)[]) => list.filter(Boolean).join(" ") || undefined;
  const logoError = errors.logo ?? logo.error;

  return (
    <div aria-busy={pending || undefined}>
      {client !== null && (
        <p className="mb-6 max-w-prose font-body text-sm text-foreground-muted">{fill(it.clientWizard.editNote, { code: client.code })}</p>
      )}
      <h2 className="mb-6 font-heading text-xl font-medium text-foreground-strong">{copy.heading}</h2>

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.name} className={LABEL}>
            {copy.labels.name}
          </label>
          <input
            id={ids.name}
            name="name"
            type="text"
            autoComplete="off"
            required
            aria-required="true"
            aria-invalid={errors.name !== undefined || undefined}
            aria-describedby={describedBy(errors.name !== undefined && ids.nameError)}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              clearError("name");
            }}
            className={INPUT}
          />
          {errors.name === undefined ? null : (
            <p id={ids.nameError} className={ERROR}>
              {errors.name}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span id={ids.industriesLabel} className={LABEL}>
            {copy.labels.industries}
          </span>
          <div ref={firstPill}>
            <IndustryPills
              options={options}
              selected={industries}
              onToggle={toggleIndustry}
              labelledBy={ids.industriesLabel}
              describedBy={describedBy(ids.industriesHint, errors.industries !== undefined && ids.industriesError)}
            />
          </div>
          <p id={ids.industriesHint} className={LABEL}>
            {copy.industriesHint}
          </p>
          {errors.industries === undefined ? null : (
            <p id={ids.industriesError} className={ERROR}>
              {errors.industries}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor={ids.description} className={LABEL}>
              {copy.labels.description}
            </label>
            <p
              id={ids.counter}
              aria-live="polite"
              className={cn(
                "font-mono text-xs tabular-nums",
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
            aria-describedby={describedBy(ids.counter, errors.description !== undefined && ids.descriptionError)}
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
              clearError("description");
            }}
            className={cn(INPUT, "resize-y")}
          />
          {errors.description === undefined ? null : (
            <p id={ids.descriptionError} className={ERROR}>
              {errors.description}
            </p>
          )}
        </div>

        <fieldset className="flex flex-col gap-1.5">
          <legend className={cn(LABEL, "mb-1.5")}>{copy.labels.logo}</legend>
          <div className="flex items-center gap-3">
            {logo.previewUrl === null ? null : (
              <LogoTile src={logo.previewUrl} alt={fill(copy.logoAlt, { name: altName })} className="size-20" />
            )}
            <input
              ref={logo.inputRef}
              id={ids.logoInput}
              type="file"
              accept={acceptFor(limits.logoTypes)}
              tabIndex={-1}
              // Reached through the Scegli il logo button only: one control, one name.
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
              aria-disabled={pending || undefined}
              aria-describedby={describedBy(ids.logoHint, logoError !== null && ids.logoError)}
              className={SECONDARY}
            >
              <ImageUp aria-hidden="true" className="size-4" />
              {logo.logo.kind === "none" ? copy.logoChoose : copy.logoReplace}
            </button>
          </div>
          <p id={ids.logoHint} className={LABEL}>
            {fill(copy.logoHint, { size: limits.logoMaxBytes / (1024 * 1024), px: limits.logoMinShortSide })}
          </p>
          {logoError === null ? null : (
            <p id={ids.logoError} className={ERROR}>
              {logoError}
            </p>
          )}
        </fieldset>

        {BRIEF_FIELDS.map((field) => {
          const id = `${baseId}-${field}`;
          const errorId = `${id}-error`;
          const text = values[field];
          const over = briefTooLong(text);
          const saveFailed = brief.failed.has(field);
          const message = over ? fill(it.clients.errors.fieldTooLong, { max: limits.briefMax }) : saveFailed ? copy.errors.saveFailed : null;
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
                required
                aria-required="true"
                placeholder={copy.placeholders[field]}
                aria-invalid={over || saveFailed || undefined}
                aria-describedby={message === null ? undefined : errorId}
                onChange={(event) => brief.change(field, event.target.value)}
                onBlur={() => void brief.save(field)}
                className="min-h-[120px] w-full resize-y rounded-md border border-transparent bg-surface-control p-3 font-body text-sm text-foreground placeholder:text-foreground-muted"
              />
              {message !== null && (
                <p id={errorId} className={ERROR}>
                  {message}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Always mounted, so screen readers announce the generic error when it appears. */}
      <div role="alert" className="mt-6 font-body text-sm text-danger empty:hidden">
        {failed ? it.clients.errors.generic : null}
      </div>

      <div role="status" aria-live="polite" aria-relevant="additions" className="sr-only">
        {announcements.map((line) => (
          <p key={line.id}>{line.text}</p>
        ))}
      </div>

      <WizardFooter
        current={1}
        steps={CLIENT_WIZARD_STEPS}
        start={ready ? undefined : <span id={ids.reason}>{fill(copy.nextReason, { fields: missing.join(copy.listSeparator) })}</span>}
        action={
          <button
            type="button"
            aria-disabled={inactive || undefined}
            aria-describedby={ready ? undefined : ids.reason}
            aria-busy={pending || undefined}
            onClick={() => void saveAndGo((id) => clientWizardHref(id, 2), { requireReady: true })}
            className={cn(PRIMARY_ACTION, PRIMARY_ACTION_INACTIVE, !ready && "cursor-not-allowed", "px-[18px] py-2.5")}
          >
            {it.wizard.next}
          </button>
        }
      />
    </div>
  );
}
