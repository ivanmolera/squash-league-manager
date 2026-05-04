import Link from "next/link";
import { Navigation } from "@/app/navigation";
import { getDictionary } from "@/src/lib/i18n";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const { t } = await getDictionary();

  return (
    <main className="auth-shell">
      <Navigation />
      <section className="auth-panel">
        <p className="eyebrow">{t.app}</p>
        <h1>{t.loginTitle}</h1>
        <p className="muted">{t.loginText}</p>
        <LoginForm labels={{ email: t.email, password: t.password, signingIn: t.signingIn, signIn: t.signIn }} />
        <Link className="back-link" href="/forgot-password">
          {t.forgotPassword}
        </Link>
        <Link className="back-link" href="/resend-verification">
          {t.resendVerification}
        </Link>
        <Link className="back-link" href="/register">
          {t.createAccount}
        </Link>
        <Link className="back-link" href="/">
          {t.backToPublic}
        </Link>
      </section>
    </main>
  );
}
