import Link from "next/link";
import { saveTournamentAction } from "@/app/admin/actions";
import { SeasonFilter } from "@/app/manager/tournaments/season-filter";
import { Navigation } from "@/app/navigation";
import { ClubCrest } from "@/src/components/club-crest";
import { RankingCodeBadge, RankingCodePicker } from "@/src/components/ranking-code-picker";
import { getCurrentUser } from "@/src/lib/auth";
import { requireFeature } from "@/src/lib/features";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";
import { rankingCodeForScope } from "@/src/lib/ranking-codes";

export const dynamic = "force-dynamic";

type TournamentTab = "upcoming" | "completed";

function selectedTab(value: string | undefined): TournamentTab {
  return value === "completed" ? "completed" : "upcoming";
}

function tournamentDateLabel(value: Date | null, locale: string, noDate: string) {
  if (!value) return noDate;
  const day = new Intl.DateTimeFormat(locale, { day: "numeric" }).format(value);
  const month = new Intl.DateTimeFormat(locale, { month: "long" })
    .format(value)
    .replace(/^(?:de\s+|d['’]\s*)/i, "");
  return `${month.toLocaleUpperCase(locale)} ${day}`;
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
  await requireFeature("tournaments");
  const query = await searchParams;
  const tab = selectedTab(query?.tab);
  const [categories, clubs, federations, seasons, currentUser, dictionary] = await Promise.all([
    prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.club.findMany({ include: { federation: true }, orderBy: [{ province: "asc" }, { name: "asc" }] }),
    prisma.federation.findMany({ include: { ranking: true }, orderBy: [{ name: "asc" }] }),
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
      organizerFederation: true,
      participants: true,
      categories: { include: { category: true } }
    },
    orderBy: tab === "completed" ? [{ startsAt: "desc" }, { name: "asc" }] : [{ startsAt: "asc" }, { name: "asc" }]
  }) : [];
  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));
  const isManager = Boolean(currentUser?.roles.some((role) => role.role === "manager"));
  const isFederationManager = Boolean(currentUser?.roles.some((role) => role.role === "manager_fed"));
  const editableFederations = isAdmin ? federations : federations.filter((federation) => federation.managerUserId === currentUser?.id);
  const editableFederationIds = new Set(editableFederations.map((federation) => federation.id));
  const editableClubs = isAdmin
    ? clubs
    : clubs.filter((club) => club.managerUserId === currentUser?.id || (club.federationId && editableFederationIds.has(club.federationId)));
  const canEdit = isAdmin || isManager || isFederationManager;
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
            <input type="hidden" name="posterUrl" value="" />
            <label>{t.poster}<input name="poster" type="file" accept="image/*" /></label>
            <label>{t.referee}<input name="refereeName" /></label>
            {editableFederations.length ? (
              <label>{t.organizerFederation}
                <select name="organizerFederationId">
                  {isAdmin ? <option value="">{t.noFederation}</option> : null}
                  {editableFederations.map((federation) => (
                    <option key={federation.id} value={federation.id}>
                      {federation.name}{federation.ranking ? ` · ${federation.ranking.code}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <RankingCodePicker defaultCode="none" label={t.scoreable} />
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
              <span>{t.date}</span>
              <span>{t.tournament}</span>
              <span>{t.categories}</span>
              <span>{t.venue}</span>
              <span>{t.registration}</span>
              <span>{t.scoreable}</span>
            </div>
            {tournaments.map((tournament) => {
              const canEditTournament = isAdmin ||
                editableClubs.some((club) => club.id === tournament.hostClubId) ||
                Boolean(tournament.organizerFederationId && editableFederationIds.has(tournament.organizerFederationId));
              const dates = tournamentDateLabels(tournament, locale, t.noDate);
              return (
                <article className="tournament-table-row" key={tournament.id}>
                  <div className="tournament-date-cell">
                    <span>{dates.start}</span>
                    <span>-</span>
                    <span>{dates.end}</span>
                  </div>
                  <div>
                    <strong><Link href={`/tournaments/${tournament.id}`}>{tournament.name}</Link></strong>
                    {tournament.organizerFederation ? <span className="muted">{t.organizerFederation}: {tournament.organizerFederation.name}</span> : null}
                    {canEditTournament ? <Link className="secondary-link inline-link" href={`/tournaments/${tournament.id}/edit`}>{t.edit}</Link> : null}
                  </div>
                  <div className="tournament-category-cell">
                    {tournament.categories.length
                      ? tournament.categories.map((category) => <span key={category.id}>{category.category.name}</span>)
                      : <span>{t.notProvidedFemale}</span>}
                  </div>
                  <span>
                    {tournament.hostClub ? (
                      <Link className="tournament-club-cell" href={`/clubs/${tournament.hostClub.id}`}>
                        <ClubCrest logoUrl={tournament.hostClub.logoUrl} clubName={tournament.hostClub.name} size="tiny" />
                        {tournament.hostClub.name}
                      </Link>
                    ) : t.noVenue}
                  </span>
                  <span>{tournament.registrationDeadline?.toLocaleDateString(locale) ?? t.noDeadline}</span>
                  <span><RankingCodeBadge code={tournament.rankingCode ?? rankingCodeForScope(tournament.rankingScope)} /></span>
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
