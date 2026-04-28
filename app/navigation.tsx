import Link from "next/link";
import { logoutAction } from "@/app/actions";
import { LanguageSelector } from "@/app/language-selector";
import { getCurrentUser } from "@/src/lib/auth";
import { getDictionary } from "@/src/lib/i18n";

export async function Navigation() {
  const [{ locale, t }, currentUser] = await Promise.all([getDictionary(), getCurrentUser()]);

  return (
    <nav className="nav">
      <Link href="/">{t.home}</Link>
      {currentUser ? <Link href="/admin/players">{t.players}</Link> : null}
      <Link href="/admin/clubs">{t.clubs}</Link>
      <Link href="/admin/leagues">{t.leagues}</Link>
      <Link href="/manager/tournaments">{t.tournaments}</Link>
      <Link href="/rankings">{t.rankings}</Link>
      <div className="nav-actions">
        <LanguageSelector
          locale={locale}
          label={t.language}
          help={t.languageHelp}
          consentMessage={t.acceptCookiesToChangeLanguage}
        />
        {currentUser ? (
          <form action={logoutAction}>
            <button className="nav-auth-button" type="submit">{t.logout}</button>
          </form>
        ) : (
          <Link className="nav-auth-link" href="/login">{t.signIn}</Link>
        )}
      </div>
    </nav>
  );
}
