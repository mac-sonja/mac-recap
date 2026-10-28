"use server";

import { redirect } from "next/navigation";
import { requestOrigin } from "@/app/_lib/origin";
import { requestPasswordReset, setPassword, signIn, signOut, signUp } from "@/modules/access";
import type { AuthFormState } from "./_lib/messages";
import { authMessage } from "./_lib/messages";

// Sign-in and sign-up run before there is an actor, so these actions call only
// the access module's session entry points (test/helpers/authorize-guard.ts).

const text = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

const fieldsOf = (details: unknown): string[] | undefined =>
  details && typeof details === "object" && "fields" in details ? (details as { fields: string[] }).fields : undefined;

/** Email + password sign-in; on success, the role's landing. */
export async function signInAction(_: AuthFormState, form: FormData): Promise<AuthFormState> {
  const result = await signIn(text(form, "email"), text(form, "password"));
  if (!result.ok) return { message: authMessage(result.error.code), values: { email: text(form, "email") } };
  redirect(result.value);
}

/** Self-sign-up on the company domain; sends the confirmation email. */
export async function signUpAction(_: AuthFormState, form: FormData): Promise<AuthFormState> {
  const input = {
    firstName: text(form, "firstName"),
    lastName: text(form, "lastName"),
    email: text(form, "email"),
    team: text(form, "team"),
    otherTitle: text(form, "otherTitle") || undefined,
    password: text(form, "password"),
  };
  const result = await signUp(input, await requestOrigin());
  if (!result.ok) {
    const fields = result.error.code === "EMAIL_DOMAIN_NOT_ALLOWED" ? ["email"] : fieldsOf(result.error.details);
    const values = { firstName: input.firstName, lastName: input.lastName, email: input.email, team: input.team, otherTitle: input.otherTitle ?? "" };
    return { message: authMessage(result.error.code), fields, values };
  }
  return { sentTo: input.email.trim().toLowerCase() };
}

/** Sends a password-reset link; the answer never says whether the address has an account. */
export async function forgotPasswordAction(_: AuthFormState, form: FormData): Promise<AuthFormState> {
  const result = await requestPasswordReset(text(form, "email"), await requestOrigin());
  if (!result.ok) {
    return { message: authMessage(result.error.code), fields: fieldsOf(result.error.details), values: { email: text(form, "email") } };
  }
  return { sent: true };
}

/** Sets the password of an invited or recovering person, then lands them. */
export async function setPasswordAction(_: AuthFormState, form: FormData): Promise<AuthFormState> {
  const result = await setPassword(text(form, "password"));
  if (!result.ok) {
    if (result.error.code === "UNAUTHENTICATED" || result.error.code === "ACCOUNT_INACTIVE") redirect("/sign-in?avviso=inattivo");
    return { message: authMessage(result.error.code), fields: fieldsOf(result.error.details) };
  }
  redirect(result.value);
}

/** Ends the session (user menu). */
export async function signOutAction(): Promise<void> {
  await signOut();
  redirect("/sign-in");
}
