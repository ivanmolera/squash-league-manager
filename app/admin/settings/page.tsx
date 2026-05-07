import { saveFeatureSettingsAction } from "@/app/admin/actions";
import { SaveConfirmation } from "@/app/leagues/[id]/edit/save-confirmation";
import { Navigation } from "@/app/navigation";
import { featureKeys, getFeatureSettings, type FeatureKey } from "@/src/lib/features";
import { getCurrentUser } from "@/src/lib/auth";
import { getDictionary } from "@/src/lib/i18n";
import { BarChart3, CalendarCheck, CalendarDays, ClipboardCheck, MapPin, MessageSquare, PencilLine, Swords, Trophy, UserPlus, Users, type LucideIcon } from "lucide-react";
import { notFound } from "next/navigation";

const featureLabelKeys: Record<FeatureKey, string> = {
  leagues: "featureLeagues",
  tournaments: "featureTournaments",
  court_bookings: "featureCourtBookings",
  match_proposals: "featureMatchProposals",
  rankings_statistics: "featureRankingsStatistics",
  public_registration: "featurePublicRegistration",
  tournament_online_registration: "featureTournamentOnlineRegistration",
  player_result_entry: "featurePlayerResultEntry",
  club_maps: "featureClubMaps",
  player_communications: "featurePlayerCommunications",
  teams: "featureTeams"
};

const featureIcons: Record<FeatureKey, LucideIcon> = {
  leagues: Trophy,
  tournaments: CalendarDays,
  court_bookings: CalendarCheck,
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
      <form className="admin-form" action={saveFeatureSettingsAction}>
        <fieldset>
          <legend>{t.featureToggles}</legend>
          {featureKeys.map((featureKey) => {
            const Icon = featureIcons[featureKey];
            return (
              <label className="check-line feature-toggle-line" key={featureKey}>
                <input
                  name="enabledFeatures"
                  type="checkbox"
                  value={featureKey}
                  defaultChecked={features[featureKey]}
                />
                <Icon aria-hidden="true" size={18} strokeWidth={2.4} />
                {t[featureLabelKeys[featureKey] as keyof typeof t]}
              </label>
            );
          })}
        </fieldset>
        <button type="submit">{t.save}</button>
      </form>
    </main>
  );
}
