"use client";

import Link from "next/link";
import { useActionState } from "react";
import { it } from "@/shared/i18n/it";
import { forgotPasswordAction } from "../actions";
import type { AuthFormState } from "../_lib/messages";
import { AuthField, FormMessage, SubmitButton } from "../_components/auth-parts";

/** Asks for the email; the answer is the same whether or not it has an account. */
export function ForgotForm() {
  const [state, action] = useActionState<AuthFormState, FormData>(forgotPasswordAction, {});
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.sent ? (
        <FormMessage tone="notice" text={it.auth.forgot.sent} />
      ) : (
        <>
          <FormMessage text={state.message} />
          <AuthField
            name="email"
            label={it.auth.email}
            type="email"
            autoComplete="email"
            required
            autoFocus
            defaultValue={state.values?.email}
            invalid={state.fields?.includes("email")}
          />
          <SubmitButton label={it.auth.forgot.submit} />
        </>
      )}
      <Link
        href="/sign-in"
        className="self-center font-label text-sm font-medium text-foreground underline-offset-4 hover:underline"
      >
        {it.auth.forgot.back}
      </Link>
    </form>
  );
}
