import Link from "next/link";
import { Navigation } from "@/app/navigation";
import { requireFeature } from "@/src/lib/features";
import { getDictionary } from "@/src/lib/i18n";
import { RegisterForm } from "./register-form";

export default async function RegisterPage() {
  await requireFeature("public_registration");
  const { t } = await getDictionary();

  return (
    <main className="auth-shell">
      <Navigation />
      <section className="auth-panel">
        <p className="eyebrow">Squash League Manager</p>
        <h1>{t.registerTitle}</h1>
        <p className="muted">{t.registerText}</p>
        <RegisterForm
          labels={{
            firstName: t.firstName,
            lastName: t.lastName,
            email: t.email,
            password: t.password,
            repeatPassword: t.repeatNewPassword,
            register: t.createAccount,
            registering: t.creatingAccount,
            verificationLink: t.verificationLinkForNow,
            goToVerification: t.goToVerification
          }}
        />
        <Link className="back-link" href="/login">
          {t.alreadyHaveAccount}
        </Link>
      </section>
    </main>
  );
}
