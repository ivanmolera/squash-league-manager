import Link from "next/link";
import { requestPasswordResetAction } from "@/app/account/actions";
import { EmailRequestForm } from "@/app/account/email-form";
import { Navigation } from "@/app/navigation";
import { getDictionary } from "@/src/lib/i18n";

export default async function ForgotPasswordPage() {
  const { t } = await getDictionary();

  return (
    <main className="auth-shell">
      <Navigation />
      <section className="auth-panel">
        <p className="eyebrow">{t.app}</p>
        <h1>{t.resetPasswordTitle}</h1>
        <p className="muted">{t.resetPasswordText}</p>
        <EmailRequestForm
          action={requestPasswordResetAction}
          labels={{ email: t.email, submit: t.resetPassword, submitting: t.creatingAccount }}
        />
        <Link className="back-link" href="/login">{t.goToLogin}</Link>
      </section>
    </main>
  );
}
