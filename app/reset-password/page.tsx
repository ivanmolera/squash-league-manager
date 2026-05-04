import Link from "next/link";
import { ResetPasswordForm } from "@/app/account/reset-password-form";
import { Navigation } from "@/app/navigation";
import { getDictionary } from "@/src/lib/i18n";

export default async function ResetPasswordPage({
  searchParams
}: {
  searchParams?: Promise<{ token?: string }>;
}) {
  const [{ t }, params] = await Promise.all([getDictionary(), searchParams]);
  const token = params?.token ?? "";

  return (
    <main className="auth-shell">
      <Navigation />
      <section className="auth-panel">
        <p className="eyebrow">{t.app}</p>
        <h1>{t.resetPasswordTitle}</h1>
        {token ? (
          <ResetPasswordForm
            token={token}
            labels={{
              password: t.password,
              repeatPassword: t.repeatNewPassword,
              submit: t.resetPassword,
              submitting: t.creatingAccount
            }}
          />
        ) : (
          <p className="form-error">{t.resetPasswordInvalidText}</p>
        )}
        <Link className="back-link" href="/login">{t.goToLogin}</Link>
      </section>
    </main>
  );
}
