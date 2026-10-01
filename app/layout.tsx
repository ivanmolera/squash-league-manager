import type { Metadata } from "next";
import { cookies } from "next/headers";
import { BackToTopButton } from "@/app/back-to-top-button";
import { CookieConsent } from "@/app/cookie-consent";
import { getDictionary } from "@/src/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: "SquashFlow",
  description: "SquashFlow: gestión de ligas, equipos, torneos, reservas y ránkings de squash."
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { locale, t } = await getDictionary();
  const theme = (await cookies()).get("slm_theme")?.value === "light" ? "light" : "dark";

  return (
    <html lang={locale} data-theme={theme}>
      <body>
        <div id="page-top" />
        {children}
        <BackToTopButton />
        <CookieConsent title={t.cookieTitle} text={t.cookieText} accept={t.acceptCookies} />
      </body>
    </html>
  );
}
