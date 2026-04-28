import type { Metadata } from "next";
import { BackToTopButton } from "@/app/back-to-top-button";
import { CookieConsent } from "@/app/cookie-consent";
import { getDictionary } from "@/src/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: "Squash League Manager",
  description: "Gestión de ligas, equipos, torneos y ránkings de squash."
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { locale, t } = await getDictionary();

  return (
    <html lang={locale}>
      <body>
        <div id="page-top" />
        {children}
        <BackToTopButton />
        <CookieConsent title={t.cookieTitle} text={t.cookieText} accept={t.acceptCookies} />
      </body>
    </html>
  );
}
