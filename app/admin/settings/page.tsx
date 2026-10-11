import { saveFeatureSettingsAction } from "@/app/admin/actions";
import { AdminSectionTabs } from "@/app/admin/admin-section-tabs";
import { SaveConfirmation } from "@/app/leagues/[id]/edit/save-confirmation";
import { Navigation } from "@/app/navigation";
import { featureKeys, getFeatureSettings, isFeatureAvailable, type FeatureKey } from "@/src/lib/features";
import { getCurrentUser } from "@/src/lib/auth";
import { getDictionary } from "@/src/lib/i18n";
import { BarChart3, CalendarCheck, CalendarDays, ClipboardCheck, CreditCard, MapPin, MessageSquare, PencilLine, Swords, Trophy, UserPlus, Users, type LucideIcon } from "lucide-react";
import { notFound } from "next/navigation";

const featureLabelKeys: Record<FeatureKey, string> = {
  leagues: "featureLeagues",
  tournaments: "featureTournaments",
  court_bookings: "featureCourtBookings",
  court_payments: "featureCourtPayments",
  match_proposals: "featureMatchProposals",
  rankings_statistics: "featureRankingsStatistics",
  public_registration: "featurePublicRegistration",
  tournament_online_registration: "featureTournamentOnlineRegistration",
  player_result_entry: "featurePlayerResultEntry",
  club_maps: "featureClubMaps",
  player_communications: "featurePlayerCommunications",
  teams: "featureTeams"
};

const featureDescriptionKeys: Record<FeatureKey, string> = {
  leagues: "featureLeaguesDescription",
  tournaments: "featureTournamentsDescription",
  court_bookings: "featureCourtBookingsDescription",
  court_payments: "featureCourtPaymentsDescription",
  match_proposals: "featureMatchProposalsDescription",
  rankings_statistics: "featureRankingsStatisticsDescription",
  public_registration: "featurePublicRegistrationDescription",
  tournament_online_registration: "featureTournamentOnlineRegistrationDescription",
  player_result_entry: "featurePlayerResultEntryDescription",
  club_maps: "featureClubMapsDescription",
  player_communications: "featurePlayerCommunicationsDescription",
  teams: "featureTeamsDescription"
};

const featureIcons: Record<FeatureKey, LucideIcon> = {
  leagues: Trophy,
  tournaments: CalendarDays,
  court_bookings: CalendarCheck,
  court_payments: CreditCard,
  match_proposals: Swords,
  rankings_statistics: BarChart3,
  public_registration: UserPlus,
  tournament_online_registration: ClipboardCheck,
  player_result_entry: PencilLine,
  club_maps: MapPin,
  player_communications: MessageSquare,
  teams: Users
};

export default async function AdminSettingsPage({
  searchParams
}: {
  searchParams?: Promise<{ saved?: string }>;
}) {
  const query = await searchParams;
  const [currentUser, dictionary, features] = await Promise.all([
    getCurrentUser(),
    getDictionary(),
    getFeatureSettings()
  ]);
  const { t } = dictionary;
  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));

  if (!isAdmin) notFound();

  return (
    <main className="app-shell">
      <Navigation />
      <section className="page-heading">
        <p className="eyebrow">{t.admin}</p>
        <h1>{t.applicationSettings}</h1>
        <p className="muted">{t.applicationSettingsIntro}</p>
        {query?.saved === "1" ? <SaveConfirmation message={t.savedSettings} /> : null}
      </section>
      <AdminSectionTabs active="settings" labels={{ settings: t.applicationSettings, visibility: t.entityActivity, admin: t.admin }} />
      <form className="admin-form" action={saveFeatureSettingsAction}>
        <fieldset>
          <legend>{t.featureToggles}</legend>
          {featureKeys.map((featureKey) => {
            const Icon = featureIcons[featureKey];
            const available = isFeatureAvailable(featureKey);
            return (
              <label className={`feature-toggle-line${available ? "" : " is-unavailable"}`} key={featureKey}>
                <Icon aria-hidden="true" size={18} strokeWidth={2.2} />
                <span className="feature-toggle-copy">
                  <span className="feature-toggle-title">
                    {t[featureLabelKeys[featureKey] as keyof typeof t]}
                    {!available ? <span className="feature-coming-soon">{t.comingSoon}</span> : null}
                  </span>
                  <small>{t[featureDescriptionKeys[featureKey] as keyof typeof t]}</small>
                </span>
                <input
                  name="enabledFeatures"
                  type="checkbox"
                  value={featureKey}
                  defaultChecked={available && features[featureKey]}
                  disabled={!available}
                />
              </label>
            );
          })}
        </fieldset>
        <button type="submit">{t.save}</button>
      </form>
    </main>
  );
}
