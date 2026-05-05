import Link from "next/link";
import { logoutAction } from "@/app/actions";
import { LanguageSelector } from "@/app/language-selector";
import { getCurrentUser } from "@/src/lib/auth";
import { getFeatureSettings } from "@/src/lib/features";
import { getDictionary } from "@/src/lib/i18n";
import packageInfo from "@/package.json";

export async function Navigation() {
  const [{ locale, t }, currentUser, features] = await Promise.all([getDictionary(), getCurrentUser(), getFeatureSettings()]);
  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));

  return (
    <nav className="nav">
      <Link href="/">{t.home}</Link>
      {currentUser?.player ? <Link href={`/players/${currentUser.player.id}/edit`}>{t.myProfile}</Link> : null}
      <Link href="/admin/players">{t.players}</Link>
      <Link href="/admin/clubs">{t.clubs}</Link>
      {features.leagues ? <Link href="/admin/leagues">{t.leagues}</Link> : null}
      {features.tournaments ? <Link href="/manager/tournaments">{t.tournaments}</Link> : null}
      {features.rankings_statistics ? <Link href="/rankings">{t.rankings}</Link> : null}
      {isAdmin ? <Link href="/admin/federations">{t.federations}</Link> : null}
      {isAdmin ? <Link href="/admin/settings">{t.settings}</Link> : null}
      <div className="nav-actions">
        <span className="app-version" title={t.version}>{t.versionShort} {packageInfo.version}</span>
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
