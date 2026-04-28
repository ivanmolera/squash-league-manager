import Link from "next/link";
import { LanguageSelector } from "@/app/language-selector";
import { getDictionary } from "@/src/lib/i18n";

export async function Navigation() {
  const { locale, t } = await getDictionary();

  return (
    <nav className="nav">
      <Link href="/">{t.app}</Link>
      <Link href="/dashboard">{t.dashboard}</Link>
      <Link href="/admin/players">{t.players}</Link>
      <Link href="/admin/clubs">{t.clubs}</Link>
      <Link href="/admin/leagues">{t.leagues}</Link>
      <Link href="/manager/tournaments">{t.tournaments}</Link>
      <LanguageSelector
        locale={locale}
        label={t.language}
        help={t.languageHelp}
        consentMessage={t.acceptCookiesToChangeLanguage}
      />
    </nav>
  );
}
