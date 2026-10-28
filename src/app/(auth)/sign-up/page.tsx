import { redirect } from "next/navigation";
import { MIN_PASSWORD_LENGTH, SIGN_UP_DOMAIN, sessionState } from "@/modules/access";
import { fill, it } from "@/shared/i18n/it";
import { AuthCard } from "../_components/auth-parts";
import { SignUpForm } from "./sign-up-form";

/** Self-sign-up for @menatcode.it addresses (owner, 2026-10-28). */
export default async function SignUpPage() {
  const state = await sessionState();
  if (state.kind === "active") redirect(state.landing);
  return (
    <AuthCard title={it.auth.signUp.title} lead={fill(it.auth.signUp.lead, { domain: SIGN_UP_DOMAIN })}>
      <SignUpForm minPassword={MIN_PASSWORD_LENGTH} />
    </AuthCard>
  );
}
