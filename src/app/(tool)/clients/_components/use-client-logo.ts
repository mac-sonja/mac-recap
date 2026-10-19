"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { flushSync } from "react-dom";
import type { ActionResult } from "@/app/_lib/action-result";
import { confirmClientLogoUpload, requestClientLogoUpload } from "@/app/(tool)/clients/actions";
import { normalizeContentType, uploadFile } from "@/app/(wizard)/_lib/upload";
import { fill, it } from "@/shared/i18n/it";
import type { ClientLimits } from "../_lib/client-limits";

/** The logo field's value: the client's current logo, a picked file not linked yet, or none (a client made before logos were required). */
export type ClientLogoValue =
  | { kind: "none" }
  | { kind: "current"; id: string; url: string | null }
  | { kind: "new"; file: File; contentType: string; previewUrl: string };

/**
 * How a logo step failed: `invalid` (the server refused the image), `retry` (network
 * or server error: Avanti may retry it), `fatal` (any other refusal, e.g. the client is
 * gone or the role lost its rights: retrying can't help).
 */
export type LogoFailure = "invalid" | "retry" | "fatal";

/** Thrown by `upload` (or by the caller's link) when the logo step fails; the other fields are already saved then. */
export class LogoStepFailed extends Error {
  constructor(readonly kind: LogoFailure) {
    super("logo step failed");
  }
}

export const logoFailureOf = (result: Extract<ActionResult<unknown>, { ok: false }>): LogoFailure =>
  result.error.code === "CLIENT_LOGO_INVALID" ? "invalid" : result.status >= 500 ? "retry" : "fatal";

/**
 * Width and height of an image file, decoded in the browser; null when the size is
 * unknown (no `createImageBitmap`, or a browser that can't decode an allowed type,
 * e.g. WebP on older Safari): the server re-checks the real pixels at confirm.
 */
export async function imageSize(file: File): Promise<{ width: number; height: number } | null> {
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

export interface ClientLogo {
  logo: ClientLogoValue;
  /** The preview to show: the picked file's object URL or the current logo's signed URL. */
  previewUrl: string | null;
  error: string | null;
  /** Shows an error on the field and moves focus to its button. */
  showError: (message: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  chooseRef: React.RefObject<HTMLButtonElement | null>;
  /** Opens the file picker (not while busy). */
  choose: () => void;
  /** The hidden file input's change handler: checks type, size and pixels before anything is uploaded. */
  onPick: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  /**
   * Presign → PUT → confirm the picked file; returns its logo id for `updateClient`
   * to link. A file already confirmed by an earlier attempt is not uploaded again
   * (a retry re-links only). Throws `LogoStepFailed` on any failure.
   */
  upload: (clientId: string) => Promise<string>;
  /** After `updateClient` linked `logoId`: the field now shows it as the current logo. */
  linked: (logoId: string) => void;
}

/**
 * The client logo field's logic, moved from the 2.14 dialog: pick (type, 1 B–5 MB,
 * short side ≥ `logoMinShortSide` px when the browser can measure it), preview, and
 * upload. `pickSeq` makes a slower, older measurement lose to a newer pick, and a
 * confirmed file is remembered so a failed link is retried without a new upload.
 * A logo can be replaced but not removed. `isBusy` blocks picks while a save runs.
 */
export function useClientLogo(
  limits: ClientLimits,
  initial: { logoId: string | null; logoUrl: string | null },
  isBusy: () => boolean,
): ClientLogo {
  const inputRef = useRef<HTMLInputElement>(null);
  const chooseRef = useRef<HTMLButtonElement>(null);
  const objectUrl = useRef<string | null>(null);
  /** Bumped on every pick, so a slower, older measurement never wins. */
  const pickSeq = useRef(0);
  /** A picked file already confirmed on the server: a retry only links it again. */
  const confirmed = useRef<{ file: File; logoId: string } | null>(null);
  const [logo, setLogo] = useState<ClientLogoValue>(
    initial.logoId !== null ? { kind: "current", id: initial.logoId, url: initial.logoUrl } : { kind: "none" },
  );
  const [error, setError] = useState<string | null>(null);

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

  function showError(message: string) {
    flushSync(() => setError(message));
    chooseRef.current?.focus();
  }

  async function onPick(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    // Reset so picking the same file again fires `change`.
    input.value = "";
    // While a save runs the logo it uses is fixed: a change now would be dropped silently.
    if (file === undefined || isBusy()) return;
    const seq = ++pickSeq.current;
    setError(null);
    const contentType = normalizeContentType(file, limits.logoTypes);
    if (contentType === null) return showError(it.clients.errors.logoType);
    if (file.size < 1) return showError(it.clients.errors.logoEmpty);
    if (file.size > limits.logoMaxBytes) {
      return showError(fill(it.clients.errors.logoTooLarge, { size: limits.logoMaxBytes / (1024 * 1024) }));
    }
    const size = await imageSize(file);
    // A newer pick or a save started meanwhile: this result is stale.
    if (seq !== pickSeq.current || isBusy()) return;
    if (size !== null && Math.min(size.width, size.height) < limits.logoMinShortSide) {
      return showError(fill(it.clients.errors.logoTooSmall, { px: limits.logoMinShortSide }));
    }
    const previewUrl = URL.createObjectURL(file);
    replacePreview(previewUrl);
    setLogo({ kind: "new", file, contentType, previewUrl });
  }

  function choose() {
    if (!isBusy()) inputRef.current?.click();
  }

  async function upload(clientId: string): Promise<string> {
    if (logo.kind !== "new") throw new LogoStepFailed("fatal");
    const { file, contentType } = logo;
    if (confirmed.current?.file === file) return confirmed.current.logoId;
    const presigned = await requestClientLogoUpload({ clientId, contentType, sizeBytes: file.size });
    if (!presigned.ok) throw new LogoStepFailed(logoFailureOf(presigned));
    const { logoId, url, method, headers } = presigned.value;
    try {
      await uploadFile({ url, method, headers }, file, () => undefined);
    } catch {
      throw new LogoStepFailed("retry");
    }
    const result = await confirmClientLogoUpload({ clientId, logoId, contentType });
    if (!result.ok) throw new LogoStepFailed(logoFailureOf(result));
    confirmed.current = { file, logoId: result.value.logoId };
    return result.value.logoId;
  }

  function linked(logoId: string) {
    // The object URL stays as the preview until the next pick or unmount.
    setLogo((current) => ({ kind: "current", id: logoId, url: current.kind === "new" ? current.previewUrl : current.kind === "current" ? current.url : null }));
  }

  const previewUrl = logo.kind === "new" ? logo.previewUrl : logo.kind === "current" ? logo.url : null;

  return { logo, previewUrl, error, showError, inputRef, chooseRef, choose, onPick, upload, linked };
}
