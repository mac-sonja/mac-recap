"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { FIELD, FIELD_HINT, FIELD_LABEL } from "@/app/_components/field-styles";
import type { Team } from "@/modules/access";
import { fill, it } from "@/shared/i18n/it";
import { signUpAction } from "../actions";
import type { AuthFormState } from "../_lib/messages";
import { AuthField, FormMessage, SubmitButton } from "../_components/auth-parts";

const TEAM_ORDER: readonly Team[] = ["designer", "account", "commerciale", "altro"];

/**
 * Open sign-up for the company domain (owner, 2026-10-28): first and last name side
 * by side, email, what the person does (Altro asks for it in words), password.
 * Once sent, the form gives way to "check your email".
 */
export function SignUpForm({ minPassword }: { minPassword: number }) {
  const [state, action] = useActionState<AuthFormState, FormData>(signUpAction, {});
  const [team, setTeam] = useState<Team | "">("");
  const invalid = (name: string) => state.fields?.includes(name);

  if (state.sentTo) {
    return <FormMessage tone="notice" text={fill(it.auth.signUp.sent, { email: state.sentTo })} />;
  }

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormMessage text={state.message} />
      <div className="grid grid-cols-2 gap-3">
        <AuthField
          name="firstName"
          label={it.auth.signUp.firstName}
          autoComplete="given-name"
          maxLength={40}
          required
          defaultValue={state.values?.firstName}
          invalid={invalid("firstName")}
        />
        <AuthField
          name="lastName"
          label={it.auth.signUp.lastName}
          autoComplete="family-name"
          maxLength={40}
          required
          defaultValue={state.values?.lastName}
          invalid={invalid("lastName")}
        />
      </div>
      <AuthField
        name="email"
        label={it.auth.email}
        type="email"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        invalid={invalid("email")}
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="auth-team" className={FIELD_LABEL}>
          {it.auth.signUp.team}
        </label>
        <select
          id="auth-team"
          name="team"
          required
          // Uncontrolled: React resets the form after the action, back to this default.
          key={state.values?.team ?? ""}
          defaultValue={state.values?.team ?? ""}
          onChange={(event) => setTeam(event.target.value as Team | "")}
          aria-invalid={invalid("team") || undefined}
          aria-describedby={team === "designer" ? "auth-team-hint" : undefined}
          className={FIELD}
        >
          <option value="" disabled>
            {it.auth.signUp.teamPlaceholder}
          </option>
          {TEAM_ORDER.map((key) => (
            <option key={key} value={key}>
              {it.auth.signUp.teams[key]}
            </option>
          ))}
        </select>
        {team === "designer" ? (
          <p id="auth-team-hint" className={FIELD_HINT}>
            {it.auth.signUp.designerHint}
          </p>
        ) : null}
      </div>
      {team === "altro" ? (
        <AuthField
          name="otherTitle"
          label={it.auth.signUp.otherTitle}
          placeholder={it.auth.signUp.otherTitlePlaceholder}
          maxLength={40}
          required
          defaultValue={state.values?.otherTitle}
          invalid={invalid("otherTitle")}
        />
      ) : null}
      <AuthField
        name="password"
        label={it.auth.password}
        type="password"
        autoComplete="new-password"
        minLength={minPassword}
        required
        hint={fill(it.auth.signUp.passwordHint, { n: minPassword })}
        invalid={invalid("password")}
      />
      <SubmitButton label={it.auth.signUp.submit} />
      <p className="text-center font-body text-sm text-foreground-muted">
        {it.auth.signUp.haveAccount}{" "}
        <Link href="/sign-in" className="font-label font-medium text-foreground underline-offset-4 hover:underline">
          {it.auth.signUp.toSignIn}
        </Link>
      </p>
    </form>
  );
}
