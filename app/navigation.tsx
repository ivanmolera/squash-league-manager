import Link from "next/link";
import { cookies } from "next/headers";
import { LogIn, LogOut } from "lucide-react";
import { logoutAction } from "@/app/actions";
import { LanguageSelector } from "@/app/language-selector";
import { ThemeSelector } from "@/app/theme-selector";
import { NavigationLinks, NavigationSettingsLink } from "@/app/navigation-links";
import { getCurrentUser } from "@/src/lib/auth";
import { getFeatureSettings } from "@/src/lib/features";
import { getDictionary } from "@/src/lib/i18n";

export async function Navigation() {
  const [{ locale, t }, currentUser, features] = await Promise.all([getDictionary(), getCurrentUser(), getFeatureSettings()]);
  const theme = (await cookies()).get("slm_theme")?.value === "light" ? "light" : "dark";
  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));
  const links = [
    { href: "/", label: t.home, section: "home" as const },
    ...(currentUser ? [{ href: currentUser.player ? `/players/${currentUser.player.id}` : "/players/me", label: t.myProfile, section: "profile" as const }] : []),
    { href: "/admin/players", label: t.players, section: "players" as const },
    { href: "/admin/clubs", label: t.clubs, section: "clubs" as const },
    ...(features.leagues ? [{ href: "/admin/leagues", label: t.leagues, section: "leagues" as const }] : []),
    ...(features.tournaments ? [{ href: "/manager/tournaments", label: t.tournaments, section: "tournaments" as const }] : []),
    ...(features.rankings_statistics ? [{ href: "/rankings", label: t.rankings, section: "rankings" as const }] : []),
    ...(isAdmin ? [{ href: "/admin/federations", label: t.federations, section: "federations" as const }] : [])
  ];

  return (
    <nav className={`nav${isAdmin ? " nav-has-settings" : ""}`}>
      <Link className="nav-brand" href="/" aria-label="SquashFlow">Squash<span>Flow</span><i aria-hidden="true" /></Link>
      <NavigationLinks items={links} />
      <div className="nav-actions">
        {isAdmin ? <NavigationSettingsLink label={t.settings} /> : null}
        <ThemeSelector initialTheme={theme} lightLabel={t.lightTheme} darkLabel={t.darkTheme} consentMessage={t.acceptCookiesToSaveTheme} />
        <LanguageSelector
          locale={locale}
          label={t.language}
          help={t.languageHelp}
          consentMessage={t.acceptCookiesToChangeLanguage}
        />
        {currentUser ? (
          <form action={logoutAction}>
            <button aria-label={t.logout} className="nav-auth-button" title={t.logout} type="submit">
              <LogOut aria-hidden="true" size={18} />
            </button>
          </form>
        ) : (
          <Link aria-label={t.signIn} className="nav-auth-link" href="/login" title={t.signIn}>
            <LogIn aria-hidden="true" size={18} />
          </Link>
        )}
      </div>
    </nav>
  );
}
