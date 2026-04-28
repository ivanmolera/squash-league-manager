import type { Metadata } from "next";
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
        {children}
        <CookieConsent title={t.cookieTitle} text={t.cookieText} accept={t.acceptCookies} />
      </body>
    </html>
  );
}
