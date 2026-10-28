import { it } from "@/shared/i18n/it";
import { AuthCard } from "../_components/auth-parts";
import { ForgotForm } from "./forgot-form";

/** Request a password-reset link (it lands on `/auth/confirm`, then `/set-password`). */
export default function ForgotPasswordPage() {
  return (
    <AuthCard title={it.auth.forgot.title} lead={it.auth.forgot.lead}>
      <ForgotForm />
    </AuthCard>
  );
}
