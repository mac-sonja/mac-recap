"use client";

import { ImageUp } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { SECONDARY_ACTION } from "@/app/_components/button-styles";
import { FIELD } from "@/app/_components/field-styles";
import { ERROR } from "@/app/_components/results-fields";
import type { ActionResult } from "@/app/_lib/action-result";
import { IndustryPills } from "@/app/(tool)/clients/_components/industry-pills";
import { LogoTile } from "@/app/(tool)/clients/_components/logo-tile";
import { checkNewSector, newSectorError } from "@/app/(tool)/clients/_components/new-sector";
import { LogoStepFailed, useClientLogo } from "@/app/(tool)/clients/_components/use-client-logo";
import { acceptFor } from "@/app/(wizard)/_lib/upload";
import { BusinessLinePills } from "@/app/(wizard)/_components/business-line-pills";
import type { ClientSector } from "@/modules/case-study";
import { it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { isClientFields, type AnyEditableFields, type FieldChange, type FieldOptions, type PanelEditor } from "./bound-fields";
import { EYEBROW, PANEL_SECTION } from "./styles";

export interface BoundFieldPanelProps {
  /** The selected element's editor: the meta line, the services or the logos. */
  editor: PanelEditor;
  /** The stored fields, as last saved. */
  fields: AnyEditableFields;
  options: FieldOptions;
  /** The client's logo as the page shows it. */
  logoUrl: string | null;
  /** Saves one change; false when it was refused or failed (the canvas says why). */
  onChange: (change: FieldChange) => Promise<boolean>;
  onAddSector: (input: { label: string }) => Promise<ActionResult<ClientSector>>;
  /** A logo that couldn't be uploaded: the canvas says why. */
  onLogoFailed: (message: string) => void;
  /** Bumped by a double-click on the meta line: the year field takes the focus (0: never). */
  focusYear: number;
  /** The year field took the focus it was asked for. */
  onYearFocused?: () => void;
}

type SaveState = "idle" | "saving" | "saved";

/** "Salvataggio…" while a change saves, then "Salvato" (polite). */
function SaveNote({ state }: { state: SaveState }) {
  const t = it.configurator.fields;
  return (
    <span aria-live="polite" className="font-label text-[11px] font-medium tracking-normal text-foreground-muted normal-case">
      {state === "saving" ? t.saving : state === "saved" ? t.saved : ""}
    </span>
  );
}

/**
 * Dati del cliente / Dati della case (Story 4.3d), in the left panel for a selected meta
 * line (the client's sector, with **Aggiungi settore**, and the case's year), the services
 * (the business-line pills) or the logos (**Sostituisci logo**). Each change saves at once
 * through the client's or the case's own update; the page shows it everywhere. A refused
 * or failed save puts the old value back and the canvas says why. Not an undo step.
 */
export function BoundFieldPanel({ editor, fields, options, logoUrl, onChange, onAddSector, onLogoFailed, focusYear, onYearFocused }: BoundFieldPanelProps) {
  const t = it.configurator.fields;
  const id = useId();
  /** The save state, shown by the section whose field saved last. */
  const [state, setState] = useState<{ section: "client" | "case"; state: SaveState }>({ section: "client", state: "idle" });
  const running = useRef(0);

  async function save(change: FieldChange): Promise<boolean> {
    const section = change.field === "year" || change.field === "service" ? "case" : "client";
    running.current += 1;
    setState({ section, state: "saving" });
    let saved = false;
    try {
      saved = await onChange(change);
      return saved;
    } finally {
      running.current -= 1;
      // A refused or failed save says so on the canvas; the note then clears.
      if (running.current === 0) setState({ section, state: saved ? "saved" : "idle" });
    }
  }
  const note = (section: "client" | "case") => <SaveNote state={state.section === section ? state.state : "idle"} />;

  const client = editor.kind === "meta" || editor.kind === "logos";
  return (
    <>
      {client && (
        <section className={PANEL_SECTION} aria-labelledby={`${id}-client`}>
          <p id={`${id}-client`} className={EYEBROW}>
            {t.clientHeading}
            {note("client")}
          </p>
          <p className="-mt-1 mb-2.5 font-label text-[12px] text-foreground-muted">{t.clientHint}</p>
          {editor.kind === "meta" && <SectorField fields={fields} options={options} onPick={(sector) => void save({ field: "sector", key: sector.key, label: sector.label })} onAddSector={onAddSector} />}
          {editor.kind === "logos" && (
            <LogoField
              fields={fields}
              options={options}
              logoUrl={logoUrl}
              onLinked={(logoId, previewUrl) => save({ field: "logo", logoId, previewUrl })}
              onFailed={onLogoFailed}
            />
          )}
        </section>
      )}
      {/* Client mode (Story 4.11a): the client's fields only, no Dati della case. */}
      {!isClientFields(fields) && (editor.kind === "meta" || editor.kind === "services") && (
        <section className={PANEL_SECTION} aria-labelledby={`${id}-case`}>
          <p id={`${id}-case`} className={EYEBROW}>
            {t.caseHeading}
            {note("case")}
          </p>
          <p className="-mt-1 mb-2.5 font-label text-[12px] text-foreground-muted">{t.caseHint}</p>
          {editor.kind === "meta" ? (
            <YearField year={fields.case.year} focus={focusYear} onFocused={onYearFocused} onCommit={(text) => save({ field: "year", text })} />
          ) : (
            <div className="flex flex-col gap-2">
              <span id={`${id}-services`} className="font-label text-[12.5px] text-foreground-muted">
                {t.services}
              </span>
              <BusinessLinePills
                options={options.businessLines}
                selected={fields.case.businessLines}
                onToggle={(line) => void save({ field: "service", line })}
                labelledBy={`${id}-services`}
              />
            </div>
          )}
        </section>
      )}
    </>
  );
}

/** The client's sector: the shared list as pills, and **Aggiungi settore** (as in the client panel). */
function SectorField({
  fields,
  options,
  onPick,
  onAddSector,
}: {
  fields: AnyEditableFields;
  options: FieldOptions;
  onPick: (sector: ClientSector) => void;
  onAddSector: BoundFieldPanelProps["onAddSector"];
}) {
  const t = it.configurator.fields;
  const copy = it.clientPanel.details.sector;
  const id = useId();
  /** The shared list as loaded, plus the sectors added here. */
  const [added, setAdded] = useState<readonly ClientSector[]>([]);
  const sectors = [...options.sectors, ...added.filter((a) => !options.sectors.some((s) => s.key === a.key))];
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  async function add() {
    if (adding) return;
    const check = checkNewSector(typed, sectors, options.limits);
    if (check.kind === "empty") return;
    if (check.kind === "length") return setError(newSectorError("length", options.limits));
    if (check.kind === "known") {
      setTyped("");
      setError(null);
      onPick(check.sector);
      return;
    }
    setAdding(true);
    setError(null);
    try {
      const result = await onAddSector({ label: check.label });
      if (!result.ok) return setError(newSectorError(result.error.code, options.limits));
      setAdded((current) => [...current, result.value]);
      setTyped("");
      onPick(result.value);
    } catch {
      setError(newSectorError("failed", options.limits));
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span id={`${id}-label`} className="font-label text-[12.5px] text-foreground-muted">
        {t.sector}
      </span>
      <IndustryPills
        options={sectors}
        selected={fields.client.industry}
        onSelect={(key) => {
          const sector = sectors.find((s) => s.key === key);
          if (sector !== undefined) onPick(sector);
        }}
        labelledBy={`${id}-label`}
      />
      <div className="flex items-center gap-2">
        <input
          type="text"
          autoComplete="off"
          aria-label={copy.newName}
          aria-invalid={error !== null || undefined}
          aria-describedby={error === null ? undefined : `${id}-error`}
          placeholder={copy.placeholder}
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
            event.preventDefault();
            void add();
          }}
          className={cn(FIELD, "h-8 min-w-0 flex-1 text-[13px]")}
        />
        <button
          type="button"
          aria-label={copy.addName}
          aria-disabled={typed.trim() === "" || adding || undefined}
          aria-busy={adding || undefined}
          onClick={() => void add()}
          className={cn(SECONDARY_ACTION, "h-8 shrink-0 px-3 text-[12.5px] aria-disabled:cursor-not-allowed aria-disabled:text-foreground-muted")}
        >
          {copy.add}
        </button>
      </div>
      {error !== null && (
        <p id={`${id}-error`} className={ERROR}>
          {error}
        </p>
      )}
    </div>
  );
}

/** The case's year: typed, saved on Enter or when the field is left; Esc puts it back. */
function YearField({
  year,
  focus,
  onFocused,
  onCommit,
}: {
  year: number;
  focus: number;
  onFocused?: () => void;
  onCommit: (text: string) => Promise<boolean>;
}) {
  const t = it.configurator.fields;
  const id = useId();
  const field = useRef<HTMLInputElement>(null);
  /** Esc: leaving the field then saves nothing. */
  const cancelled = useRef(false);

  // A new year from outside (a save, the page reloading) shows unless the field is being typed in.
  useEffect(() => {
    if (field.current !== null && document.activeElement !== field.current) field.current.value = String(year);
  }, [year]);

  // A double-click on the meta line focuses the field.
  const focused = useRef(onFocused);
  useEffect(() => {
    focused.current = onFocused;
  });
  useEffect(() => {
    if (focus === 0) return;
    field.current?.focus();
    field.current?.select?.();
    focused.current?.();
  }, [focus]);

  async function commit(input: HTMLInputElement) {
    if (cancelled.current) {
      cancelled.current = false;
      input.value = String(year);
      return;
    }
    const saved = await onCommit(input.value);
    // Refused or failed: the stored year again.
    if (!saved && document.activeElement !== input) input.value = String(year);
  }

  function onKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelled.current = true;
      event.currentTarget.blur();
    }
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="w-[76px] shrink-0 font-label text-[12.5px] text-foreground-muted">
        {t.year}
      </label>
      <input
        ref={field}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        defaultValue={String(year)}
        onKeyDown={onKey}
        onBlur={(event) => void commit(event.currentTarget)}
        className={cn(FIELD, "h-8 w-24 text-[13px] tabular-nums")}
      />
    </div>
  );
}

/** The client's logo with **Sostituisci logo**: the file is checked, uploaded and confirmed, then linked to the client. */
function LogoField({
  fields,
  options,
  logoUrl,
  onLinked,
  onFailed,
}: {
  fields: AnyEditableFields;
  options: FieldOptions;
  logoUrl: string | null;
  onLinked: (logoId: string, previewUrl: string | null) => Promise<boolean>;
  onFailed: (message: string) => void;
}) {
  const t = it.configurator.fields;
  const errorId = useId();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const logo = useClientLogo(options.limits, { logoId: fields.client.logoId, logoUrl }, () => busyRef.current);
  const { upload, linked, inputRef, chooseRef, choose, onPick, error } = logo;
  const picked = logo.logo.kind === "new" ? logo.logo : null;
  /** The picked file already sent: a failed one is sent again only when picked again. */
  const sent = useRef<File | null>(null);
  const linkable = fields.client.industry !== null && fields.client.description.trim() !== "";

  useEffect(() => {
    if (picked === null || sent.current === picked.file) return;
    sent.current = picked.file;
    // The link (`updateClient`) needs the client's sector and description: without them nothing is uploaded (the button said why).
    if (!linkable) return;
    busyRef.current = true;
    void (async () => {
      setBusy(true);
      try {
        const logoId = await upload(fields.client.id);
        if (await onLinked(logoId, picked.previewUrl)) linked(logoId);
      } catch (error) {
        const kind = error instanceof LogoStepFailed ? error.kind : "retry";
        onFailed(kind === "unsafe" ? it.clients.errors.logoUnsafe : kind === "invalid" ? t.errors.CLIENT_LOGO_INVALID : t.errors.failed);
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    })();
  }, [picked, upload, linked, onLinked, onFailed, fields.client.id, linkable, t]);

  return (
    <div className="flex flex-col gap-2">
      <span className="font-label text-[12.5px] text-foreground-muted">{t.logo}</span>
      {logoUrl !== null ? (
        <LogoTile src={logoUrl} alt={fields.client.name} className="h-14 w-28" />
      ) : (
        <p className="font-label text-[12.5px] text-foreground-muted">{t.noLogo}</p>
      )}
      <input ref={inputRef} type="file" hidden accept={acceptFor(options.limits.logoTypes)} onChange={(event) => void onPick(event)} />
      <button
        ref={chooseRef}
        type="button"
        aria-disabled={busy || undefined}
        aria-busy={busy || undefined}
        aria-describedby={error === null ? undefined : errorId}
        onClick={() => {
          // Checked before any upload, so no logo is left unlinked.
          if (linkable) choose();
          else onFailed(t.needClientInfo);
        }}
        className={cn(SECONDARY_ACTION, "h-8 w-full gap-1.5 text-[12.5px] aria-disabled:cursor-not-allowed aria-disabled:opacity-60")}
      >
        <ImageUp aria-hidden="true" className="size-4" />
        {t.replaceLogo}
      </button>
      {error !== null && (
        <p id={errorId} className={ERROR}>
          {error}
        </p>
      )}
    </div>
  );
}
