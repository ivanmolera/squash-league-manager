import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import { cookies } from "next/headers";
import { BackToTopButton } from "@/app/back-to-top-button";
import { CookieConsent } from "@/app/cookie-consent";
import { getDictionary } from "@/src/lib/i18n";
import packageInfo from "@/package.json";
import "./globals.css";

const montserrat = Montserrat({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-montserrat"
});

export const metadata: Metadata = {
  title: "SquashFlow",
  description: "SquashFlow: gestión de ligas, equipos, torneos, reservas y ránkings de squash."
};

export async function generateViewport(): Promise<Viewport> {
  return { width: (await cookies()).get("slm_desktop_view")?.value === "1" ? 1200 : "device-width", initialScale: 1 };
}

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { locale, t } = await getDictionary();
  const theme = (await cookies()).get("slm_theme")?.value === "light" ? "light" : "dark";

  return (
    <html className={montserrat.variable} lang={locale} data-theme={theme}>
      <body>
        <div id="page-top" />
        {children}
        <footer className="app-footer">
          <span>SquashFlow</span>
          <span>{t.version} {packageInfo.version}</span>
        </footer>
        <BackToTopButton />
        <CookieConsent title={t.cookieTitle} text={t.cookieText} accept={t.acceptCookies} />
      </body>
    </html>
  );
}
