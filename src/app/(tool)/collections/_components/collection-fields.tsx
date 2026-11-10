"use client";

import { Check } from "lucide-react";
import { useId } from "react";
import { FIELD, FIELD_LABEL } from "@/app/_components/field-styles";
import { BusinessLinePills } from "@/app/(wizard)/_components/business-line-pills";
import { CHOICE_PILL, PILL_GAP } from "@/app/(tool)/clients/_components/industry-pills";
import type { BusinessLine, ClientSector } from "@/modules/case-study";
import { it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";

/** A collection's tags as a form holds them (Story 5.10a). */
export interface TagsValue {
  businessLines: BusinessLine[];
  industries: string[];
}

/** The lists the tag pickers offer: `BUSINESS_LINES` and the client sectors (`listClientSectors`). */
export interface TagOptions {
  businessLines: readonly BusinessLine[];
  sectors: readonly ClientSector[];
}

/** The fields a save can refuse, as an action names them. */
export type CollectionField = "name" | "businessLines" | "industries";

/** A name is 1–120 characters once trimmed (`COLLECTION_NAME_MAX`). */
export const NAME_MAX = 120;
export const nameError = (name: string): boolean => {
  const length = [...name.trim()].length;
  return length < 1 || length > NAME_MAX;
};

/** The fields a form has left wrong: an empty or too long name, no business line, no industry. */
export function invalidFields(value: { name?: string } & TagsValue): CollectionField[] {
  const out: CollectionField[] = [];
  if (value.name !== undefined && nameError(value.name)) out.push("name");
  if (value.businessLines.length === 0) out.push("businessLines");
  if (value.industries.length === 0) out.push("industries");
  return out;
}

/** `list` with `item` switched on or off, in `order`'s order. */
export const toggled = <T,>(list: readonly T[], item: T, order: readonly T[]): T[] =>
  list.includes(item) ? list.filter((x) => x !== item) : order.filter((x) => x === item || list.includes(x));

/**
 * The client industries as multi-select pills (Story 5.10a), styled as the case's Servizi
 * (`BusinessLinePills`): toggle buttons (`aria-pressed`) with a check on each one picked.
 */
export function IndustryMultiPills({
  options,
  selected,
  onToggle,
  labelledBy,
  describedBy,
  invalid,
  disabled,
}: {
  options: readonly ClientSector[];
  selected: readonly string[];
  onToggle: (key: string) => void;
  labelledBy: string;
  describedBy?: string;
  invalid?: boolean;
  disabled?: boolean;
}) {
  return (
    <div role="group" aria-labelledby={labelledBy} aria-describedby={describedBy} aria-invalid={invalid || undefined} className={cn("flex flex-wrap", PILL_GAP)}>
      {options.map((sector) => (
        <button
          key={sector.key}
          type="button"
          aria-pressed={selected.includes(sector.key)}
          aria-disabled={disabled || undefined}
          onClick={() => {
            if (!disabled) onToggle(sector.key);
          }}
          className={cn(CHOICE_PILL, "aria-disabled:cursor-not-allowed aria-disabled:opacity-60")}
        >
          {selected.includes(sector.key) && <Check aria-hidden="true" className="size-3.5" strokeWidth={2.5} />}
          {sector.label}
        </button>
      ))}
    </div>
  );
}

/** A collection's name field, with its error under it. */
export function NameField({ value, onChange, error, disabled }: { value: string; onChange: (name: string) => void; error: boolean; disabled?: boolean }) {
  const id = useId();
  const errorId = useId();
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className={FIELD_LABEL}>
        {it.collections.form.name}
      </label>
      <input
        id={id}
        type="text"
        data-autofocus
        autoComplete="off"
        maxLength={NAME_MAX * 2}
        value={value}
        disabled={disabled}
        placeholder={it.collections.form.namePlaceholder}
        aria-invalid={error || undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={FIELD}
      />
      {error && (
        <p id={errorId} className="font-label text-xs text-danger">
          {it.collections.form.errors.name}
        </p>
      )}
    </div>
  );
}

/** The two tag pickers (Servizi, Settori), each with its error under it. */
export function TagsFields({
  value,
  onChange,
  options,
  errors,
  disabled,
}: {
  value: TagsValue;
  onChange: (value: TagsValue) => void;
  options: TagOptions;
  errors: readonly CollectionField[];
  disabled?: boolean;
}) {
  const linesId = useId();
  const linesErrorId = useId();
  const sectorsId = useId();
  const sectorsErrorId = useId();
  const copy = it.collections.form;
  const linesInvalid = errors.includes("businessLines");
  const sectorsInvalid = errors.includes("industries");
  return (
    <>
      <div className="flex flex-col gap-2">
        <span id={linesId} className={FIELD_LABEL}>
          {copy.businessLines}
        </span>
        <BusinessLinePills
          options={options.businessLines}
          selected={value.businessLines}
          onToggle={(line) => onChange({ ...value, businessLines: toggled(value.businessLines, line, options.businessLines) })}
          labelledBy={linesId}
          {...(linesInvalid ? { describedBy: linesErrorId } : {})}
          invalid={linesInvalid}
          disabled={disabled}
        />
        {linesInvalid && (
          <p id={linesErrorId} className="font-label text-xs text-danger">
            {copy.errors.businessLines}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <span id={sectorsId} className={FIELD_LABEL}>
          {copy.industries}
        </span>
        <IndustryMultiPills
          options={options.sectors}
          selected={value.industries}
          onToggle={(key) => onChange({ ...value, industries: toggled(value.industries, key, options.sectors.map((s) => s.key)) })}
          labelledBy={sectorsId}
          {...(sectorsInvalid ? { describedBy: sectorsErrorId } : {})}
          invalid={sectorsInvalid}
          disabled={disabled}
        />
        {sectorsInvalid && (
          <p id={sectorsErrorId} className="font-label text-xs text-danger">
            {copy.errors.industries}
          </p>
        )}
      </div>
    </>
  );
}

/** The fields an action's `INVALID_INPUT` named, among the form's. */
export const refusedFields = (fields: readonly string[] | undefined): CollectionField[] =>
  (fields ?? []).filter((f): f is CollectionField => f === "name" || f === "businessLines" || f === "industries");
