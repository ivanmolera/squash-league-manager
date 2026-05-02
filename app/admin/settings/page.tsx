import { saveFeatureSettingsAction } from "@/app/admin/actions";
import { Navigation } from "@/app/navigation";
import { featureKeys, getFeatureSettings, type FeatureKey } from "@/src/lib/features";
import { getCurrentUser } from "@/src/lib/auth";
import { getDictionary } from "@/src/lib/i18n";
import { notFound } from "next/navigation";

const featureLabelKeys: Record<FeatureKey, string> = {
  leagues: "featureLeagues",
  tournaments: "featureTournaments",
  court_bookings: "featureCourtBookings",
  rankings_statistics: "featureRankingsStatistics",
  public_registration: "featurePublicRegistration",
  tournament_online_registration: "featureTournamentOnlineRegistration",
  player_result_entry: "featurePlayerResultEntry",
  club_maps: "featureClubMaps",
  player_communications: "featurePlayerCommunications",
  teams: "featureTeams"
};

export default async function AdminSettingsPage() {
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
      </section>
      <form className="admin-form" action={saveFeatureSettingsAction}>
        <fieldset>
          <legend>{t.featureToggles}</legend>
          {featureKeys.map((featureKey) => (
            <label className="check-line" key={featureKey}>
              <input
                name="enabledFeatures"
                type="checkbox"
                value={featureKey}
                defaultChecked={features[featureKey]}
              />
              {t[featureLabelKeys[featureKey] as keyof typeof t]}
            </label>
          ))}
        </fieldset>
        <button type="submit">{t.save}</button>
      </form>
    </main>
  );
}
