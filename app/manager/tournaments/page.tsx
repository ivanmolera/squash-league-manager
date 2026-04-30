import Link from "next/link";
import { saveTournamentAction } from "@/app/admin/actions";
import { SeasonFilter } from "@/app/manager/tournaments/season-filter";
import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

type TournamentTab = "upcoming" | "completed";

function selectedTab(value: string | undefined): TournamentTab {
  return value === "completed" ? "completed" : "upcoming";
}

function tournamentDateLabel(value: Date | null, locale: string, noDate: string) {
  if (!value) return noDate;
  const parts = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).formatToParts(value);
  const day = parts.find((part) => part.type === "day")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return day && month ? `${day} ${month}` : value.toLocaleDateString(locale);
}

function tournamentDateLabels(tournament: { startsAt: Date | null; endsAt: Date | null }, locale: string, noDate: string) {
  const start = tournamentDateLabel(tournament.startsAt, locale, noDate);
  const end = tournament.endsAt ? tournamentDateLabel(tournament.endsAt, locale, noDate) : start;
  return { start, end };
}

export default async function TournamentsPage({
  searchParams
}: {
  searchParams?: Promise<{ tab?: string; seasonId?: string }>;
}) {
  const query = await searchParams;
  const tab = selectedTab(query?.tab);
  const [categories, clubs, seasons, currentUser, dictionary] = await Promise.all([
    prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.club.findMany({ orderBy: [{ province: "asc" }, { name: "asc" }] }),
    prisma.season.findMany({ orderBy: [{ startsAt: "desc" }] }),
    getCurrentUser(),
    getDictionary()
  ]);
  const { locale, t } = dictionary;
  const today = new Date();
  const selectedSeason = seasons.find((season) => season.id === query?.seasonId) ??
    seasons.find((season) => season.startsAt <= today && season.endsAt >= today) ??
    seasons[0];
  const tournaments = selectedSeason ? await prisma.competition.findMany({
    where: {
      type: "tournament",
      seasonId: selectedSeason.id,
      ...(tab === "completed" ? { endsAt: { lt: today } } : { OR: [{ endsAt: null }, { endsAt: { gte: today } }] })
    },
    include: {
      hostClub: true,
      participants: true,
      categories: { include: { category: true } }
    },
    orderBy: tab === "completed" ? [{ startsAt: "desc" }, { name: "asc" }] : [{ startsAt: "asc" }, { name: "asc" }]
  }) : [];
  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));
  const isManager = Boolean(currentUser?.roles.some((role) => role.role === "manager"));
  const editableClubs = isAdmin ? clubs : clubs.filter((club) => club.managerUserId === currentUser?.id);
  const canEdit = isAdmin || isManager;
  const tabHref = (nextTab: TournamentTab) => `/manager/tournaments?tab=${nextTab}${selectedSeason ? `&seasonId=${selectedSeason.id}` : ""}`;

  return (
    <main className="app-shell">
      <Navigation />
      <section className="page-heading">
        <p className="eyebrow">{t.manager}</p>
        <h1>{t.tournaments}</h1>
      </section>

      <section className="tournament-page-stack">
        {canEdit ? (
          <form className="admin-form wide-form" action={saveTournamentAction}>
            <h2>{t.newTournament}</h2>
            <label>{t.name}<input name="name" required /></label>
            <label>{t.description}<textarea name="description" rows={3} /></label>
            <label>{t.referee}<input name="refereeName" /></label>
            <label>{t.rankingType}
              <select name="rankingScope" defaultValue="none">
                <option value="none">{t.noRanking}</option>
                <option value="autonomic">{t.rankingAutonomic}</option>
                <option value="state">{t.state}</option>
                <option value="psa">{t.psa}</option>
              </select>
            </label>
            <label>{t.matchFormat}
              <select name="bestOfSets" defaultValue="5">
                <option value="5">{t.bestOf5}</option>
                <option value="3">{t.bestOf3}</option>
              </select>
            </label>
            <label>{t.hostClub}
              <select name="hostClubId" required>
                {editableClubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
              </select>
            </label>
            <div className="form-row">
              <label>{t.registrationDeadline}<input name="registrationDeadline" type="date" required /></label>
              <label>{t.start}<input name="startsAt" type="date" required /></label>
            </div>
            <div className="form-row">
              <label>{t.end}<input name="endsAt" type="date" required /></label>
            </div>
            <fieldset className="check-grid">
              <legend>{t.categories}</legend>
              {categories.map((category) => (
                <label key={category.id}>
                  <input type="checkbox" name="categoryIds" value={category.id} />
                  {category.name}
                </label>
              ))}
            </fieldset>
            <p className="muted">{t.tournamentCreatedWithoutPlayers}</p>
            <button type="submit" name="mode" value="save">{t.saveTournament}</button>
          </form>
        ) : null}

        <section className="tournament-list-panel">
          <div className="tournament-toolbar">
            <nav className="tournament-tabs" aria-label={t.tournaments}>
              <Link className={tab === "upcoming" ? "is-active" : ""} href={tabHref("upcoming")}>{t.upcoming}</Link>
              <Link className={tab === "completed" ? "is-active" : ""} href={tabHref("completed")}>{t.completed}</Link>
            </nav>
            <SeasonFilter seasons={seasons} selectedSeasonId={selectedSeason?.id} tab={tab} label={t.seasonSelector} />
          </div>
          <div className="tournament-table">
            <div className="tournament-table-head">
              <span>{t.start}/{t.end}</span>
              <span>{t.tournament}</span>
              <span>{t.location}</span>
              <span>{t.categories}</span>
              <span>{t.registration}</span>
              <span>{t.rankingType}</span>
            </div>
            {tournaments.map((tournament) => {
              const canEditTournament = isAdmin || editableClubs.some((club) => club.id === tournament.hostClubId);
              const dates = tournamentDateLabels(tournament, locale, t.noDate);
              return (
                <article className="tournament-table-row" key={tournament.id}>
                  <div className="tournament-date-cell">
                    <span>{dates.start}</span>
                    <span>{dates.end}</span>
                  </div>
                  <div>
                    <strong><Link href={`/tournaments/${tournament.id}`}>{tournament.name}</Link></strong>
                    <span>{t.referee}: {tournament.refereeName ?? t.notProvided}</span>
                    {canEditTournament ? <Link className="secondary-link inline-link" href={`/tournaments/${tournament.id}/edit`}>{t.edit}</Link> : null}
                  </div>
                  <span>{tournament.hostClub ? <Link href={`/clubs/${tournament.hostClub.id}`}>{tournament.hostClub.name}</Link> : t.noVenue}</span>
                  <span>{tournament.categories.map((category) => category.category.name).join(", ") || t.notProvidedFemale}</span>
                  <span>{tournament.registrationDeadline?.toLocaleDateString(locale) ?? t.noDeadline}</span>
                  <span>{rankingScopeText(tournament.rankingScope, t)}</span>
                </article>
              );
            })}
            {!tournaments.length ? <p className="muted">{t.noTournaments}</p> : null}
          </div>
        </section>
      </section>
    </main>
  );
}

function rankingScopeText(scope: string, t: Record<string, string>) {
  if (scope === "none") return t.none;
  return `${t.scoresForRanking} ${t[scope] ?? scope}`;
}
