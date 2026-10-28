import { redirect } from "next/navigation";
import { MIN_PASSWORD_LENGTH, getActor } from "@/modules/access";
import { fill, it } from "@/shared/i18n/it";
import { AuthCard } from "../_components/auth-parts";
import { SetPasswordForm } from "./set-password-form";

/**
 * Where an invite or a password-reset link ends up (after `/auth/confirm` made
 * the session): the person picks a password. No usable session → sign-in.
 */
export default async function SetPasswordPage() {
  const actor = await getActor();
  if (!actor.ok) redirect("/sign-in?avviso=link-scaduto");
  return (
    <AuthCard title={it.auth.setPassword.title} lead={fill(it.auth.setPassword.lead, { email: actor.value.email })}>
      <SetPasswordForm minPassword={MIN_PASSWORD_LENGTH} />
    </AuthCard>
  );
}
