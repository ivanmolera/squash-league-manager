import Link from "next/link";
import { cookies } from "next/headers";
import { LogIn, LogOut } from "lucide-react";
import { logoutAction } from "@/app/actions";
import { AdminViewToggle } from "@/app/admin-view-toggle";
import { LanguageSelector } from "@/app/language-selector";
import { MobileNavigation } from "@/app/mobile-navigation";
import { ThemeSelector } from "@/app/theme-selector";
import { ViewModeSelector } from "@/app/view-mode-selector";
import { NavigationLinks, NavigationSettingsLink } from "@/app/navigation-links";
import { getAuthenticatedUser, getCurrentUser, playerPreviewCookieName } from "@/src/lib/auth";
import { getFeatureSettings } from "@/src/lib/features";
import { getDictionary } from "@/src/lib/i18n";

export async function Navigation() {
  const [{ locale, t }, currentUser, actualUser, features] = await Promise.all([getDictionary(), getCurrentUser(), getAuthenticatedUser(), getFeatureSettings()]);
  const cookieStore = await cookies();
  const theme = cookieStore.get("slm_theme")?.value === "light" ? "light" : "dark";
  const actualAdmin = Boolean(actualUser?.roles.some((role) => role.role === "admin"));
  const playerPreview = actualAdmin && cookieStore.get(playerPreviewCookieName)?.value === "1";
  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));
  const isFederationManager = Boolean(currentUser?.roles.some((role) => role.role === "manager_fed"));
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
  const quickItems = [
    ...(currentUser?.player && (features.leagues || (features.court_bookings && features.match_proposals)) ? [{ href: "/agenda", label: t.agenda, icon: "agenda" as const }] : []),
    ...(currentUser?.player && features.leagues && features.player_result_entry ? [{ href: "/agenda/results", label: t.results, icon: "results" as const }] : []),
    ...(features.rankings_statistics ? [{ href: "/rankings", label: t.rankings, icon: "rankings" as const }] : []),
    ...(features.court_bookings ? [{ href: "/bookings", label: t.bookingsShort, icon: "bookings" as const }] : []),
    ...(features.tournaments ? [{ href: "/manager/tournaments", label: t.tournaments, icon: "tournaments" as const }] : [])
  ];

  return (
    <nav className={`nav${isAdmin || isFederationManager ? " nav-has-settings" : ""}`}>
      <Link className="nav-brand" href="/" aria-label="SquashFlow">Squash<span>Flow</span><i aria-hidden="true" /></Link>
      <NavigationLinks items={links} />
      <MobileNavigation items={links} quickItems={quickItems} moreLabel={t.more} quickNavLabel={t.quickNav} />
      <div className="nav-actions">
        {actualAdmin ? <AdminViewToggle preview={playerPreview} playerLabel={t.viewAsPlayer} adminLabel={t.viewAsAdmin} /> : null}
        <ViewModeSelector label={t.viewMode} mobileLabel={t.mobileView} desktopLabel={t.desktopView} />
        {isAdmin || isFederationManager ? (
          <NavigationSettingsLink
            href={isAdmin ? "/admin/settings" : "/admin/visibility"}
            label={isAdmin ? t.settings : t.entityActivity}
          />
        ) : null}
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
