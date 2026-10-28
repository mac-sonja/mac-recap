import { redirect } from "next/navigation";
import { sessionState } from "@/modules/access";
import { it } from "@/shared/i18n/it";
import { AuthCard } from "../_components/auth-parts";
import { signInNotice } from "../_lib/messages";
import { SignInForm } from "./sign-in-form";

/**
 * The sign-in screen (Story 6.1). A person already signed in goes to their
 * landing; a session with no enabled profile is told so (and can sign in as
 * someone else, which replaces the session).
 */
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ avviso?: string }> }) {
  const [state, params] = await Promise.all([sessionState(), searchParams]);
  if (state.kind === "active") redirect(state.landing);
  const notice = state.kind === "inactive" ? it.auth.signIn.inactive : signInNotice(params.avviso);
  return (
    <AuthCard title={it.auth.signIn.title} lead={it.auth.signIn.lead}>
      <SignInForm notice={notice} />
    </AuthCard>
  );
}
