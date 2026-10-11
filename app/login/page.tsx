import Link from "next/link";
import { Navigation } from "@/app/navigation";
import { getDictionary } from "@/src/lib/i18n";
import { googleOAuthConfigured } from "@/src/lib/google-oauth";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ google_error?: string }> }) {
  const { t } = await getDictionary();
  const { google_error: googleError } = await searchParams;
  const googleErrorMessage = googleError === "unavailable" ? t.googleUnavailable
    : googleError === "suspended" ? t.accountSuspended
    : googleError === "link_required" ? t.googleLinkRequired
    : googleError === "registration_disabled" ? t.googleRegistrationDisabled
    : googleError === "conflict" ? t.googleAccountConflict
    : googleError ? t.googleSignInFailed : null;

  return (
    <main className="auth-shell">
      <Navigation />
      <section className="auth-panel">
        <p className="eyebrow">{t.app}</p>
        <h1>{t.loginTitle}</h1>
        <p className="muted">{googleOAuthConfigured() ? t.loginText : t.loginTextPasswordOnly}</p>
        <LoginForm labels={{ email: t.email, password: t.password, signingIn: t.signingIn, signIn: t.signIn }} />
        {googleErrorMessage ? <p className="form-error" role="alert">{googleErrorMessage}</p> : null}
        {googleOAuthConfigured() ? (
          <Link className="google-auth-link" href="/api/auth/google/start">
            <span className="google-mark" aria-hidden="true">G</span>{t.signInWithGoogle}
          </Link>
        ) : null}
        <Link className="back-link" href="/register">
          {t.createAccount}
        </Link>
        <Link className="back-link" href="/forgot-password">
          {t.forgotPassword}
        </Link>
        <Link className="back-link" href="/resend-verification">
          {t.resendVerification}
        </Link>
      </section>
    </main>
  );
}
