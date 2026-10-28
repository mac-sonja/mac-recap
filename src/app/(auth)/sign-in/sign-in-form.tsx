"use client";

import Link from "next/link";
import { useActionState } from "react";
import { it } from "@/shared/i18n/it";
import { signInAction } from "../actions";
import type { AuthFormState } from "../_lib/messages";
import { AuthField, FormMessage, SubmitButton } from "../_components/auth-parts";

const LINK = "font-label text-sm font-medium text-foreground underline-offset-4 hover:underline";

/** Email + password. A notice from the URL (expired link, inactive account) shows until the first submit. */
export function SignInForm({ notice }: { notice: string | null }) {
  const [state, action] = useActionState<AuthFormState, FormData>(signInAction, {});
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormMessage text={state.message ?? notice} />
      <AuthField name="email" label={it.auth.email} type="email" autoComplete="email" required autoFocus defaultValue={state.values?.email} />
      <AuthField name="password" label={it.auth.password} type="password" autoComplete="current-password" required />
      <SubmitButton label={it.auth.signIn.submit} />
      <div className="flex flex-col items-center gap-3 pt-1">
        <Link href="/forgot-password" className={LINK}>
          {it.auth.signIn.forgot}
        </Link>
        <p className="font-body text-sm text-foreground-muted">
          {it.auth.signIn.noAccount}{" "}
          <Link href="/sign-up" className={LINK}>
            {it.auth.signIn.toSignUp}
          </Link>
        </p>
      </div>
    </form>
  );
}
