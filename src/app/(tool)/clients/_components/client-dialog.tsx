"use client";

import { ImageUp, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { PRIMARY_ACTION, PRIMARY_ACTION_INACTIVE } from "@/app/_components/button-styles";
import { Dialog } from "@/app/_components/dialog";
import type { ActionResult } from "@/app/_lib/action-result";
import { confirmClientLogoUpload, createClient, requestClientLogoUpload, updateClient } from "@/app/(tool)/clients/actions";
import { acceptFor, normalizeContentType, uploadFile } from "@/app/(wizard)/_lib/upload";
import type { Client, ClientDetail } from "@/modules/case-study";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { LogoTile } from "./logo-tile";

/** The limits the dialog checks before any request; the page passes the module's constants. */
export interface ClientLimits {
  /** `CLIENT_NAME_MAX`, counted like the server (UTF-16 length after trimming). */
  nameMax: number;
  /** `CLIENT_SECTOR_MAX`, in characters (code points) after trimming. */
  sectorMax: number;
  /** `CLIENT_DESCRIPTION_MAX`, in characters (code points) after trimming. */
  descriptionMax: number;
  /** `LOGO_CONTENT_TYPES`. */
  logoTypes: readonly string[];
  /** `LOGO_MAX_BYTES`. */
  logoMaxBytes: number;
  /** `LOGO_MIN_SHORT_SIDE_PX`. */
  logoMinShortSide: number;
}

export type ClientDialogMode = { kind: "add" } | { kind: "edit"; client: ClientDetail };

export interface ClientDialogProps {
  mode: ClientDialogMode;
  limits: ClientLimits;
  /** Esc or Annulla with nothing saved: the caller unmounts the dialog, and focus goes back to the opener. */
  onClose: () => void;
  /**
   * After a save, or Esc / Annulla after a partial one (the fields were saved but
   * the logo failed): the caller closes the dialog and refreshes the page.
   */
  onSaved: (client: Client) => void;
}

type Logo =
  | { kind: "none" }
  | { kind: "current"; id: string; url: string | null }
  | { kind: "new"; file: File; contentType: string; previewUrl: string };

interface Fields {
  name: string;
  sector: string | null;
  description: string | null;
}

type FieldKey = "name" | "sector" | "description";

const INPUT =
  "w-full rounded-md border bg-surface-control px-3 py-2 font-body text-sm text-foreground placeholder:text-foreground-muted aria-invalid:border-danger";
const SECONDARY =
  "inline-flex items-center gap-2 rounded-md bg-surface-control px-3 py-2 font-label text-sm text-foreground hover:bg-surface-selected";
const LABEL = "font-label text-xs text-foreground-muted";
const ERROR = "font-label text-xs text-danger";

/** Characters as the server counts them: code points, so an emoji is one. */
const charCount = (text: string) => [...text].length;

const optionalText = (value: string) => {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

const sameFields = (a: Fields | null, b: Fields) =>
  a !== null && a.name === b.name && a.sector === b.sector && a.description === b.description;

/**
 * Width and height of an image file, decoded in the browser; null when the size is
 * unknown (no `createImageBitmap`, or a browser that can't decode an allowed type,
 * e.g. WebP on older Safari): the server re-checks the real pixels at confirm.
 */
async function imageSize(file: File): Promise<{ width: number; height: number } | null> {
  if (typeof globalThis.createImageBitmap !== "function") return null;
  try {
    const bitmap = await globalThis.createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close?.();
    return size;
  } catch {
    return null;
  }
}

/**
 * How a logo step failed: `invalid` (the server refused the image), `retry` (network
 * or server error: Save may retry it), `fatal` (any other refusal, e.g. the client is
 * gone or the role lost its rights: retrying can't help).
 */
type LogoFailure = "invalid" | "retry" | "fatal";

/** Thrown inside the save when the logo step fails; the fields are already saved then. */
class LogoStepFailed extends Error {
  constructor(readonly kind: LogoFailure) {
    super("logo step failed");
  }
}

const failureOf = (result: Extract<ActionResult<unknown>, { ok: false }>): LogoFailure =>
  result.error.code === "CLIENT_LOGO_INVALID" ? "invalid" : result.status >= 500 ? "retry" : "fatal";

/**
 * One dialog for **Aggiungi cliente** and **Modifica cliente**: Nome (required),
 * Settore (optional), Descrizione (optional, live counter) and Logo (optional
 * upload with a preview on a white tile, and **Rimuovi**). No code field: the code is
 * automatic and never changes. Mounted open by the caller.
 *
 * Every field is checked here first (an inline error, no request, focus on the
 * first invalid field); a picked logo is checked for type, size and pixels before
 * anything is uploaded. Save order: the fields (add, or edit when changed), then a
 * new logo (presign → PUT → confirm), then `updateClient` links it. If the logo
 * step fails the fields stay saved, an added client switches the dialog to edit
 * mode, the logo error shows inline, and Save retries the logo only. While a save
 * is in flight, Annulla and Esc are ignored and a second submit sends nothing.
 */
export function ClientDialog({ mode, limits, onClose, onSaved }: ClientDialogProps) {
  const formId = useId();
  const nameId = useId();
  const sectorId = useId();
  const descriptionId = useId();
  const logoInputId = useId();
  const ids = {
    nameError: `${nameId}-error`,
    sectorHint: `${sectorId}-hint`,
    sectorError: `${sectorId}-error`,
    counter: `${descriptionId}-counter`,
    descriptionError: `${descriptionId}-error`,
    logoHint: `${logoInputId}-hint`,
    logoError: `${logoInputId}-error`,
  };
  const inFlight = useRef(false);
  /** Something was written in this dialog (a partial save): closing still refreshes the page. */
  const wroteSomething = useRef(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const chooseRef = useRef<HTMLButtonElement>(null);
  const objectUrl = useRef<string | null>(null);
  /** Bumped on every pick or removal, so a slower, older measurement never wins. */
  const pickSeq = useRef(0);
  /** A picked file already confirmed on the server: a retry only links it again. */
  const confirmed = useRef<{ file: File; logoId: string } | null>(null);

  const initial = mode.kind === "edit" ? mode.client : null;
  /** The client as last saved; null until an add has created it. */
  const [client, setClient] = useState<Client | null>(initial);
  /** The fields saved by this dialog, so a retry after a logo failure skips saving them again. */
  const [savedFields, setSavedFields] = useState<Fields | null>(null);
  const [name, setName] = useState(initial?.name ?? "");
  const [sector, setSector] = useState(initial?.sector ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [logo, setLogo] = useState<Logo>(
    initial?.logoId ? { kind: "current", id: initial.logoId, url: initial.logoUrl } : { kind: "none" },
  );
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [logoError, setLogoError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);

  const editing = client !== null;

  useEffect(
    () => () => {
      if (objectUrl.current !== null) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );

  function replacePreview(url: string | null) {
    if (objectUrl.current !== null) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = url;
  }

  // While a save is in flight the client may still be written: Annulla and Esc do nothing.
  // After a partial save (fields saved, logo failed) closing still refreshes the page.
  function cancel() {
    if (inFlight.current) return;
    if (wroteSomething.current && client !== null) onSaved(client);
    else onClose();
  }

  function clearError(key: FieldKey) {
    setErrors((current) => {
      if (current[key] === undefined) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function showErrors(next: Partial<Record<FieldKey, string>>) {
    // Commit aria-invalid and the messages before focus moves, so they are announced.
    flushSync(() => setErrors(next));
    const first = (["name", "sector", "description"] as const).find((key) => next[key] !== undefined);
    const target = { name: nameId, sector: sectorId, description: descriptionId }[first ?? "name"];
    document.getElementById(target)?.focus();
  }

  function showLogoError(message: string) {
    flushSync(() => setLogoError(message));
    chooseRef.current?.focus();
  }

  async function onPickLogo(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    // Reset so picking the same file again fires `change`.
    input.value = "";
    // While a save runs the logo it uses is fixed: a change now would be dropped silently.
    if (file === undefined || inFlight.current) return;
    const seq = ++pickSeq.current;
    setLogoError(null);
    const contentType = normalizeContentType(file, limits.logoTypes);
    if (contentType === null) return showLogoError(it.clients.errors.logoType);
    if (file.size < 1) return showLogoError(it.clients.errors.logoEmpty);
    if (file.size > limits.logoMaxBytes) {
      return showLogoError(fill(it.clients.errors.logoTooLarge, { size: limits.logoMaxBytes / (1024 * 1024) }));
    }
    const size = await imageSize(file);
    // A newer pick, a removal or a save started meanwhile: this result is stale.
    if (seq !== pickSeq.current || inFlight.current) return;
    if (size !== null && Math.min(size.width, size.height) < limits.logoMinShortSide) {
      return showLogoError(fill(it.clients.errors.logoTooSmall, { px: limits.logoMinShortSide }));
    }
    const previewUrl = URL.createObjectURL(file);
    replacePreview(previewUrl);
    setLogo({ kind: "new", file, contentType, previewUrl });
  }

  function chooseLogo() {
    if (!inFlight.current) logoInputRef.current?.click();
  }

  function removeLogo() {
    if (inFlight.current) return;
    pickSeq.current += 1;
    replacePreview(null);
    setLogo({ kind: "none" });
    setLogoError(null);
    // The Rimuovi button unmounts: keep focus in the logo field.
    chooseRef.current?.focus();
  }

  /** Field errors from a refusal; true when the refusal was shown on a field. */
  function showRefusal(result: Extract<ActionResult<unknown>, { ok: false }>): boolean {
    const { code, fields } = result.error;
    if (code === "CLIENT_NAME_TAKEN") showErrors({ name: it.clients.errors.nameTaken });
    else if (code === "CLIENT_CODE_EXHAUSTED") showErrors({ name: it.clients.errors.codeExhausted });
    else if (code === "INVALID_INPUT" && fields?.length === 1 && fields[0] === "name") {
      showErrors({ name: it.clients.errors.nameRequired });
    } else if (code === "CLIENT_FIELD_TOO_LONG" && fields !== undefined && fields.length > 0) {
      const next: Partial<Record<FieldKey, string>> = {};
      if (fields.includes("sector")) next.sector = fill(it.clients.errors.fieldTooLong, { max: limits.sectorMax });
      if (fields.includes("description")) next.description = fill(it.clients.errors.fieldTooLong, { max: limits.descriptionMax });
      showErrors(next);
    } else return false;
    return true;
  }

  /** Presign → PUT → confirm; the new logo's id. Throws `LogoStepFailed` on any failure. */
  async function uploadLogo(clientId: string, file: File, contentType: string): Promise<string> {
    const presigned = await requestClientLogoUpload({ clientId, contentType, sizeBytes: file.size });
    if (!presigned.ok) throw new LogoStepFailed(failureOf(presigned));
    const { logoId, url, method, headers } = presigned.value;
    try {
      await uploadFile({ url, method, headers }, file, () => undefined);
    } catch {
      throw new LogoStepFailed("retry");
    }
    const result = await confirmClientLogoUpload({ clientId, logoId, contentType });
    if (!result.ok) throw new LogoStepFailed(failureOf(result));
    confirmed.current = { file, logoId: result.value.logoId };
    return result.value.logoId;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const fields: Fields = { name: name.trim(), sector: optionalText(sector), description: optionalText(description) };
    const invalid: Partial<Record<FieldKey, string>> = {};
    if (fields.name === "") invalid.name = it.clients.errors.nameRequired;
    else if (fields.name.length > limits.nameMax) invalid.name = fill(it.clients.errors.nameTooLong, { max: limits.nameMax });
    if (fields.sector !== null && charCount(fields.sector) > limits.sectorMax) {
      invalid.sector = fill(it.clients.errors.fieldTooLong, { max: limits.sectorMax });
    }
    if (fields.description !== null && charCount(fields.description) > limits.descriptionMax) {
      invalid.description = fill(it.clients.errors.fieldTooLong, { max: limits.descriptionMax });
    }
    if (Object.keys(invalid).length > 0) return showErrors(invalid);

    inFlight.current = true;
    setPending(true);
    setFailed(false);
    setErrors({});
    setLogoError(null);
    let saved = false;
    let current = client;
    try {
      // 1. The fields: add, or edit (a retry after a logo failure, fields unchanged, skips this).
      if (current === null) {
        const created = await createClient(fields);
        if (!created.ok) {
          if (!showRefusal(created)) setFailed(true);
          return;
        }
        current = created.value;
        wroteSomething.current = true;
        setClient(current);
        setSavedFields(fields);
      } else {
        const keptLogoId = logo.kind === "current" ? logo.id : logo.kind === "none" ? null : current.logoId;
        if (!sameFields(savedFields, fields) || keptLogoId !== current.logoId) {
          const updated = await updateClient({ clientId: current.id, ...fields, logoId: keptLogoId });
          if (!updated.ok) {
            if (updated.error.code === "CLIENT_LOGO_INVALID") showLogoError(it.clients.errors.logoUnreadable);
            else if (!showRefusal(updated)) setFailed(true);
            return;
          }
          current = updated.value;
          wroteSomething.current = true;
          setClient(current);
          setSavedFields(fields);
        }
      }

      // 2. A new logo: upload it, then link it.
      if (logo.kind === "new") {
        try {
          // Already confirmed by an earlier attempt whose link failed: only link it again.
          const logoId =
            confirmed.current?.file === logo.file
              ? confirmed.current.logoId
              : await uploadLogo(current.id, logo.file, logo.contentType);
          const linked = await updateClient({ clientId: current.id, ...fields, logoId });
          if (!linked.ok) throw new LogoStepFailed(failureOf(linked));
          current = linked.value;
        } catch (error) {
          const kind: LogoFailure = error instanceof LogoStepFailed ? error.kind : "retry";
          if (kind === "fatal") setFailed(true);
          else showLogoError(kind === "invalid" ? it.clients.errors.logoUnreadable : it.clients.errors.logoFailed);
          return;
        }
      }

      saved = true;
      onSaved(current);
    } catch {
      setFailed(true);
    } finally {
      if (!saved) {
        inFlight.current = false;
        setPending(false);
      }
    }
  }

  const previewUrl = logo.kind === "new" ? logo.previewUrl : logo.kind === "current" ? logo.url : null;
  const altName = name.trim() || client?.name || "";
  const descriptionCount = charCount(description.trim());
  const describedBy = (...list: (string | false)[]) => list.filter(Boolean).join(" ") || undefined;

  return (
    <Dialog
      open
      onClose={cancel}
      title={editing ? it.clients.dialog.editTitle : it.clients.dialog.addTitle}
      description={editing ? fill(it.clients.dialog.editDescription, { code: client.code }) : it.clients.dialog.addDescription}
      actions={
        <>
          <button type="button" onClick={cancel} aria-disabled={pending || undefined} className={SECONDARY}>
            {it.clients.dialog.cancel}
          </button>
          <button
            type="submit"
            form={formId}
            aria-disabled={pending || undefined}
            aria-busy={pending || undefined}
            className={cn(PRIMARY_ACTION, PRIMARY_ACTION_INACTIVE)}
          >
            {editing ? it.clients.dialog.submitEdit : it.clients.dialog.submitAdd}
          </button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={onSubmit} aria-busy={pending || undefined} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={nameId} className={LABEL}>
            {it.clients.dialog.nameLabel}
          </label>
          <input
            id={nameId}
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
          <label htmlFor={sectorId} className={LABEL}>
            {it.clients.dialog.sectorLabel} {it.clients.dialog.optional}
          </label>
          <input
            id={sectorId}
            name="sector"
            type="text"
            autoComplete="off"
            aria-invalid={errors.sector !== undefined || undefined}
            aria-describedby={describedBy(ids.sectorHint, errors.sector !== undefined && ids.sectorError)}
            value={sector}
            onChange={(event) => {
              setSector(event.target.value);
              clearError("sector");
            }}
            className={INPUT}
          />
          <p id={ids.sectorHint} className="font-label text-xs text-foreground-muted">
            {fill(it.clients.dialog.sectorHint, { max: limits.sectorMax })}
          </p>
          {errors.sector === undefined ? null : (
            <p id={ids.sectorError} className={ERROR}>
              {errors.sector}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor={descriptionId} className={LABEL}>
              {it.clients.dialog.descriptionLabel} {it.clients.dialog.optional}
            </label>
            <p
              id={ids.counter}
              aria-live="polite"
              className={cn(
                "font-mono text-xs tabular-nums",
                descriptionCount > limits.descriptionMax ? "text-danger" : "text-foreground-muted",
              )}
            >
              {fill(it.clients.dialog.counter, { n: descriptionCount, max: limits.descriptionMax })}
            </p>
          </div>
          <textarea
            id={descriptionId}
            name="description"
            rows={5}
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
          <legend className={cn(LABEL, "mb-1.5")}>
            {it.clients.dialog.logoLabel} {it.clients.dialog.optional}
          </legend>
          <div className="flex items-center gap-3">
            {previewUrl === null ? null : (
              <LogoTile src={previewUrl} alt={fill(it.clients.dialog.logoAlt, { name: altName })} className="size-20" />
            )}
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={logoInputRef}
                id={logoInputId}
                type="file"
                accept={acceptFor(limits.logoTypes)}
                tabIndex={-1}
                // Reached through the Scegli il logo button only: one control, one name.
                aria-hidden="true"
                onChange={onPickLogo}
                className="sr-only"
              />
              <button
                ref={chooseRef}
                type="button"
                onClick={chooseLogo}
                aria-disabled={pending || undefined}
                aria-describedby={describedBy(ids.logoHint, logoError !== null && ids.logoError)}
                className={SECONDARY}
              >
                <ImageUp aria-hidden="true" className="size-4" />
                {logo.kind === "none" ? it.clients.dialog.logoChoose : it.clients.dialog.logoReplace}
              </button>
              {logo.kind === "none" ? null : (
                <button type="button" onClick={removeLogo} aria-disabled={pending || undefined} className={SECONDARY}>
                  <Trash2 aria-hidden="true" className="size-4" />
                  {it.clients.dialog.logoRemove}
                </button>
              )}
            </div>
          </div>
          <p id={ids.logoHint} className="font-label text-xs text-foreground-muted">
            {fill(it.clients.dialog.logoHint, {
              size: limits.logoMaxBytes / (1024 * 1024),
              px: limits.logoMinShortSide,
            })}
          </p>
          {logoError === null ? null : (
            <p id={ids.logoError} className={ERROR}>
              {logoError}
            </p>
          )}
        </fieldset>

        {/* Always mounted, so screen readers announce the generic error when it appears. */}
        <div role="alert" className="font-body text-sm text-danger empty:hidden">
          {failed ? it.clients.errors.generic : null}
        </div>
      </form>
    </Dialog>
  );
}
