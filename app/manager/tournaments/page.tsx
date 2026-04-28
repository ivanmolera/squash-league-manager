import Link from "next/link";
import { saveTournamentAction } from "@/app/admin/actions";
import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

type TournamentTab = "upcoming" | "completed";

function selectedTab(value: string | undefined): TournamentTab {
  return value === "completed" ? "completed" : "upcoming";
}

function tournamentDateRange(tournament: { startsAt: Date | null; endsAt: Date | null }, locale: string, noDate: string) {
  if (!tournament.startsAt && !tournament.endsAt) return noDate;
  const start = tournament.startsAt?.toLocaleDateString(locale, { month: "short", day: "2-digit" }) ?? noDate;
  const end = tournament.endsAt?.toLocaleDateString(locale, { month: "short", day: "2-digit" }) ?? start;
  return `${start} - ${end}`;
}

function tournamentLocation(tournament: { hostClub: { city: string | null; province: string | null; name: string } | null }, noVenue: string) {
  if (!tournament.hostClub) return noVenue;
  if (tournament.hostClub.city && tournament.hostClub.province) return `${tournament.hostClub.city} (${tournament.hostClub.province})`;
  return tournament.hostClub.city ?? tournament.hostClub.province ?? tournament.hostClub.name;
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
        <p className="eyebrow">Manager</p>
        <h1>Torneos</h1>
        <p className="muted">Inicia sesión como manager o admin para crear torneos.</p>
      </section>

      <section className={canEdit ? "work-grid" : "centered-list"}>
        {canEdit ? (
          <form className="admin-form wide-form" action={saveTournamentAction}>
            <h2>Nuevo torneo</h2>
            <label>Nombre<input name="name" required /></label>
            <label>Descripción<textarea name="description" rows={3} /></label>
            <label>Juez árbitro<input name="refereeName" /></label>
            <label>Tipo de ránking
              <select name="rankingScope" defaultValue="none">
                <option value="none">No puntúa para ránking</option>
                <option value="autonomic">Ránking autonómico</option>
                <option value="state">Ránking estatal</option>
                <option value="psa">Ránking PSA</option>
              </select>
            </label>
            <label>Formato de partido
              <select name="bestOfSets" defaultValue="5">
                <option value="5">Al mejor de 5 sets</option>
                <option value="3">Al mejor de 3 sets</option>
              </select>
            </label>
            <label>Club sede
              <select name="hostClubId" required>
                {editableClubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
              </select>
            </label>
            <div className="form-row">
              <label>Límite inscripción<input name="registrationDeadline" type="date" required /></label>
              <label>Inicio<input name="startsAt" type="date" required /></label>
            </div>
            <div className="form-row">
              <label>Fin<input name="endsAt" type="date" required /></label>
            </div>
            <fieldset className="check-grid">
              <legend>Categorías</legend>
              {categories.map((category) => (
                <label key={category.id}>
                  <input type="checkbox" name="categoryIds" value={category.id} />
                  {category.name}
                </label>
              ))}
            </fieldset>
            <p className="muted">El torneo se crea sin jugadores inscritos. Los jugadores podrán inscribirse después y el manager o admin podrá añadir inscripciones a petición.</p>
            <button type="submit" name="mode" value="save">Guardar torneo</button>
          </form>
        ) : null}

        <section className="list-panel tournament-list-panel">
          <div className="tournament-toolbar">
            <nav className="tournament-tabs" aria-label={t.tournaments}>
              <Link className={tab === "upcoming" ? "is-active" : ""} href={tabHref("upcoming")}>{t.upcoming}</Link>
              <Link className={tab === "completed" ? "is-active" : ""} href={tabHref("completed")}>{t.completed}</Link>
            </nav>
            <form className="season-filter" action="/manager/tournaments">
              <input type="hidden" name="tab" value={tab} />
              <select name="seasonId" defaultValue={selectedSeason?.id}>
                {seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}
              </select>
              <button type="submit">{t.filter}</button>
            </form>
          </div>
          <div className="tournament-table">
            <div className="tournament-table-head">
              <span>{t.start}</span>
              <span>{t.tournament}</span>
              <span>{t.location}</span>
              <span>{t.categories}</span>
              <span>{t.registration}</span>
              <span>{t.rankingType}</span>
            </div>
            {tournaments.map((tournament) => {
              const canEditTournament = isAdmin || editableClubs.some((club) => club.id === tournament.hostClubId);
              return (
                <article className="tournament-table-row" key={tournament.id}>
                  <div className="tournament-date-cell">{tournamentDateRange(tournament, locale, t.noDate)}</div>
                  <div>
                    <strong><Link href={`/tournaments/${tournament.id}`}>{tournament.name}</Link></strong>
                    <span>{t.referee}: {tournament.refereeName ?? t.notProvided}</span>
                    {canEditTournament ? <Link className="secondary-link inline-link" href={`/tournaments/${tournament.id}/edit`}>{t.edit}</Link> : null}
                  </div>
                  <span>{tournamentLocation(tournament, t.noVenue)}</span>
                  <span>{tournament.categories.map((category) => category.category.name).join(", ") || t.notProvidedFemale}</span>
                  <span>{tournament.registrationDeadline?.toLocaleDateString(locale) ?? t.noDeadline}</span>
                  <span>{rankingScopeText(tournament.rankingScope, t)}</span>
                </article>
              );
            })}
            {!tournaments.length ? <p className="muted">{t.noMatches}</p> : null}
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
