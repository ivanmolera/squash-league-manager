import Link from "next/link";
import { notFound } from "next/navigation";
import { registerSelfForTournamentAction } from "@/app/admin/actions";
import { Navigation } from "@/app/navigation";
import { TournamentMatches } from "@/app/tournaments/[id]/tournament-matches";
import { ClubCrest } from "@/src/components/club-crest";
import { RankingCodeBadge } from "@/src/components/ranking-code-picker";
import { getCurrentUser, isManagerFor } from "@/src/lib/auth";
import { isClubEffectivelyActive } from "@/src/lib/entity-activity";
import { localizeCategoryName } from "@/src/lib/category-names";
import { getFeatureSettings, requireFeature } from "@/src/lib/features";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";
import { rankingCodeForScope } from "@/src/lib/ranking-codes";

export const dynamic = "force-dynamic";

function playerAgeAt(referenceDate: Date, birthDate: Date | null) {
  if (!birthDate) return null;

  let age = referenceDate.getFullYear() - birthDate.getFullYear();
  const birthdayThisYear = new Date(referenceDate);
  birthdayThisYear.setMonth(birthDate.getMonth(), birthDate.getDate());
  if (referenceDate < birthdayThisYear) age -= 1;
  return age;
}

function canPlayerRegisterForCategory(
  player: { gender: string; birthDate: Date | null },
  category: { genderScope: string; minAge: number | null; maxAge: number | null },
  referenceDate: Date
) {
  if (category.genderScope !== "not_specified" && player.gender !== category.genderScope) {
    return false;
  }

  const age = playerAgeAt(referenceDate, player.birthDate);
  if (category.minAge !== null && (age === null || age < category.minAge)) {
    return false;
  }

  if (category.maxAge !== null && (age === null || age > category.maxAge)) {
    return false;
  }

  return true;
}

export default async function TournamentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireFeature("tournaments");
  const { id } = await params;
  const [tournament, currentUser, dictionary, features] = await Promise.all([
    prisma.competition.findUnique({
      where: { id },
      include: {
        hostClub: { include: { federation: { select: { active: true } } } },
        categories: { include: { category: true, seeds: true, drawEntries: true, registrations: { include: { player: true } } } }
      }
    }),
    getCurrentUser(),
    getDictionary(),
    getFeatureSettings()
  ]);
  const { locale, t } = dictionary;

  if (!tournament || tournament.type !== "tournament") notFound();

  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));
  const canEdit = isAdmin || isManagerFor(currentUser, tournament.hostClub?.managerUserId);
  const currentPlayer = currentUser
    ? await prisma.player.findUnique({ where: { userId: currentUser.id }, select: { id: true, active: true, gender: true, birthDate: true } })
    : null;
  const registrationOpen = Boolean(
    tournament.registrationDeadline && tournament.registrationDeadline >= new Date() &&
    tournament.hostClub && isClubEffectivelyActive(tournament.hostClub)
  );
  const seedsByCategory = new Map(
    tournament.categories.flatMap((category) =>
      category.seeds.map((seed) => [`${category.id}:${seed.playerId}`, seed.seedNumber] as const)
    )
  );

  return (
    <main className="app-shell">
      <Navigation />
      <section className="detail-header">
        <div>
          <p className="eyebrow">{t.tournament}</p>
          <h1>{tournament.name}</h1>
        </div>
        {canEdit ? <Link className="primary-link" href={`/tournaments/${tournament.id}/edit`}>{t.edit}</Link> : null}
        <a className="secondary-link mobile-draw-link" href="#tournament-draws">{t.draw}</a>
      </section>
      <section className="detail-grid">
        <article className="list-panel full-width">
          <h2>{t.tournamentDetails}</h2>
          {tournament.posterUrl ? <img className="tournament-poster-detail" src={tournament.posterUrl} alt={tournament.name} /> : null}
          {tournament.hostClub ? (
            <p className="club-reference-line">
              <ClubCrest logoUrl={tournament.hostClub.logoUrl} clubName={tournament.hostClub.name} size="small" />
              <span><strong>{t.club}:</strong> <Link href={`/clubs/${tournament.hostClub.id}`}>{tournament.hostClub.name}</Link></span>
            </p>
          ) : (
            <p><strong>{t.club}:</strong> {t.noVenue}</p>
          )}
          <p><strong>{t.referee}:</strong> {tournament.refereeName ?? t.notProvided}</p>
          <p className="detail-inline-badge">
            <strong>{t.scoreable}:</strong> <RankingCodeBadge code={tournament.rankingCode ?? rankingCodeForScope(tournament.rankingScope)} />
          </p>
          <p><strong>{t.matchFormat}:</strong> {tournament.bestOfSets === 3 ? t.bestOf3 : t.bestOf5}</p>
          <p><strong>{t.description}:</strong> {tournament.description ?? t.notProvidedFemale}</p>
          <p><strong>{t.categories}:</strong> {tournament.categories.map((item) => localizeCategoryName(item.category.name, locale)).join(", ")}</p>
          <p className="date-row">
            <span><strong>{t.registration}:</strong> {tournament.registrationDeadline?.toLocaleDateString(locale) ?? t.noDeadline}</span>
            <span><strong>{t.start}:</strong> {tournament.startsAt?.toLocaleDateString(locale) ?? t.noDate}</span>
            <span><strong>{t.end}:</strong> {tournament.endsAt?.toLocaleDateString(locale) ?? t.noDate}</span>
          </p>
        </article>
      </section>
      <section className="tournament-category-list" id="tournament-draws">
        {tournament.categories.map((competitionCategory) => {
          const isRegistered = Boolean(currentPlayer && competitionCategory.registrations.some((registration) => registration.playerId === currentPlayer.id));
          const isEligible = Boolean(
            currentPlayer?.active &&
              canPlayerRegisterForCategory(currentPlayer, competitionCategory.category, tournament.startsAt ?? new Date())
          );
          const hasDraw = competitionCategory.drawEntries.length > 0;
          const participantSection = (
            <section className="tournament-participants">
              <h3>{t.participants} <span>({competitionCategory.registrations.length})</span></h3>
              {competitionCategory.registrations.length ? (
                <div className="tournament-participant-grid">
                  {competitionCategory.registrations.map((registration) => {
                    const seedNumber = seedsByCategory.get(`${competitionCategory.id}:${registration.playerId}`);
                    return (
                      <div className="tournament-participant" key={registration.id}>
                        <div className="tournament-participant-main">
                          <Link href={`/players/${registration.playerId}`}>{registration.playerNameAtRegistration}</Link>
                          {seedNumber ? <span className="tournament-participant-seed" title={`${t.seedSingle} #${seedNumber}`}>#{seedNumber}</span> : null}
                        </div>
                        <span className="tournament-participant-club">{registration.clubNameAtRegistration ?? t.independent}</span>
                      </div>
                    );
                  })}
                </div>
              ) : <p className="muted">{t.noRegisteredPlayers}</p>}
            </section>
          );
          const matchView = (
            <TournamentMatches
              competitionId={tournament.id}
              competitionCategoryId={competitionCategory.id}
              canEdit={canEdit}
              showHeading={false}
              collapseMatchList
            />
          );

          return (
            <section className="tournament-category-section" key={competitionCategory.id}>
              <div className="tournament-category-heading">
                <h2>{localizeCategoryName(competitionCategory.category.name, locale)}</h2>
                {features.tournament_online_registration && currentPlayer && registrationOpen && !isRegistered && isEligible ? (
                  <form className="compact-form" action={registerSelfForTournamentAction}>
                    <input type="hidden" name="competitionCategoryId" value={competitionCategory.id} />
                    <button type="submit">{t.registerMyself}</button>
                  </form>
                ) : null}
              </div>
              {hasDraw ? matchView : participantSection}
              {hasDraw ? participantSection : matchView}
            </section>
          );
        })}
      </section>
    </main>
  );
}
