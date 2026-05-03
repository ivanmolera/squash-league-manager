import Link from "next/link";
import { Navigation } from "@/app/navigation";
import { hashSessionToken } from "@/src/lib/auth";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";

export default async function VerifyEmailPage({
  searchParams
}: {
  searchParams?: Promise<{ token?: string }>;
}) {
  const [{ t }, params] = await Promise.all([getDictionary(), searchParams]);
  const token = params?.token;
  let status: "missing" | "invalid" | "expired" | "verified" = "missing";

  if (token) {
    const verification = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hashSessionToken(token) }
    });

    if (!verification || verification.usedAt) {
      status = "invalid";
    } else if (verification.expiresAt <= new Date()) {
      status = "expired";
    } else {
      await prisma.$transaction([
        prisma.user.update({
          where: { id: verification.userId },
          data: { emailVerified: true }
        }),
        prisma.emailVerificationToken.update({
          where: { id: verification.id },
          data: { usedAt: new Date() }
        })
      ]);
      status = "verified";
    }
  }

  const title = status === "verified" ? t.emailVerifiedTitle : t.emailVerificationFailedTitle;
  const text = status === "verified"
    ? t.emailVerifiedText
    : status === "expired"
      ? t.emailVerificationExpiredText
      : t.emailVerificationInvalidText;

  return (
    <main className="auth-shell">
      <Navigation />
      <section className="auth-panel">
        <p className="eyebrow">{t.app}</p>
        <h1>{title}</h1>
        <p className="muted">{text}</p>
        <Link className="back-link" href="/login">
          {t.goToLogin}
        </Link>
      </section>
    </main>
  );
}
