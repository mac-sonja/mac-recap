import { createHash } from "node:crypto";
import {
  RENDITION_SPECS,
  SPECS_BY_KIND,
  type RenditionKind,
  type RenditionSpec,
  type RenditionSpecName,
} from "@/modules/material/domain/rendition";

/** JSON with object keys sorted at every level, so equal values always give the same text. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

const sha256Hex = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

/** The first 16 hex characters of the sha256 of the spec's canonical JSON. */
export function specHash(spec: RenditionSpec): string {
  return sha256Hex(canonicalJson(spec)).slice(0, 16);
}

export const specHashOf = (name: RenditionSpecName) => specHash(RENDITION_SPECS[name]);

/**
 * The `rendition` job's input hash for one asset: the sha256 of the asset id
 * plus every spec hash of its kind. Enqueueing twice with the same specs is
 * deduplicated; a new spec version gives a new job.
 */
export function renditionInputHash(assetId: string, kind: RenditionKind): string {
  return sha256Hex(canonicalJson({ assetId, specs: SPECS_BY_KIND[kind].map(specHashOf) }));
}
