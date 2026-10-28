"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { PRIMARY_ACTION } from "@/app/_components/button-styles";
import { CARD, FIELD, FIELD_HINT, FIELD_LABEL } from "@/app/_components/field-styles";
import { cn } from "@/shared/utils";

/** The card every auth screen sits in: title, lead, then the form. */
export function AuthCard({ title, lead, children }: { title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <section className={cn(CARD, "flex flex-col gap-6 p-8")}>
      <header className="flex flex-col gap-1.5">
        <h1 className="font-heading text-2xl leading-tight font-semibold tracking-[-0.02em] text-foreground-strong">
          {title}
        </h1>
        {lead ? <p className="font-body text-sm leading-snug text-foreground-muted">{lead}</p> : null}
      </header>
      {children}
    </section>
  );
}

/** A labelled input; `invalid` marks it for screen readers and draws the danger border. */
export function AuthField({
  name,
  label,
  hint,
  invalid,
  ...input
}: { name: string; label: string; hint?: string; invalid?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = `auth-${name}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={FIELD_LABEL}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        aria-invalid={invalid || undefined}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={FIELD}
        {...input}
      />
      {hint ? (
        <p id={`${id}-hint`} className={FIELD_HINT}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** The form's one primary action, inactive while the form is submitting. */
export function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" aria-disabled={pending || undefined} className={cn(PRIMARY_ACTION, "h-10 w-full")}>
      {label}
    </button>
  );
}

/** A message after a submit: an error (`role="alert"`) or a neutral notice. */
export function FormMessage({ text, tone = "error" }: { text?: string | null; tone?: "error" | "notice" }) {
  if (!text) return null;
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-md px-3.5 py-2.5 font-body text-sm leading-snug",
        tone === "error" ? "bg-danger/10 text-danger" : "bg-surface-control text-foreground",
      )}
    >
      {text}
    </p>
  );
}
