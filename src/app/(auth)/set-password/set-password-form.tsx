"use client";

import { useActionState } from "react";
import { fill, it } from "@/shared/i18n/it";
import { setPasswordAction } from "../actions";
import type { AuthFormState } from "../_lib/messages";
import { AuthField, FormMessage, SubmitButton } from "../_components/auth-parts";

export function SetPasswordForm({ minPassword }: { minPassword: number }) {
  const [state, action] = useActionState<AuthFormState, FormData>(setPasswordAction, {});
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormMessage text={state.message} />
      <AuthField
        name="password"
        label={it.auth.password}
        type="password"
        autoComplete="new-password"
        minLength={minPassword}
        required
        autoFocus
        hint={fill(it.auth.signUp.passwordHint, { n: minPassword })}
        invalid={state.fields?.includes("password")}
      />
      <SubmitButton label={it.auth.setPassword.submit} />
    </form>
  );
}
