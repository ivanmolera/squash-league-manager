import Link from "next/link";
import { notFound } from "next/navigation";
import { registerSelfForTournamentAction } from "@/app/admin/actions";
import { Navigation } from "@/app/navigation";
import { TournamentMatches } from "@/app/tournaments/[id]/tournament-matches";
import { ClubCrest } from "@/src/components/club-crest";
import { RankingCodeBadge } from "@/src/components/ranking-code-picker";
import { getCurrentUser } from "@/src/lib/auth";
import { categoryRestrictionLabel } from "@/src/lib/category-restrictions";
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
  const { id } = await params;
  const [tournament, currentUser, dictionary] = await Promise.all([
    prisma.competition.findUnique({
      where: { id },
      include: {
        hostClub: true,
        categories: { include: { category: true, seeds: true, drawEntries: true, registrations: { include: { player: true } } } }
      }
    }),
    getCurrentUser(),
    getDictionary()
  ]);
  const { locale, t } = dictionary;

  if (!tournament || tournament.type !== "tournament") notFound();

  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));
  const canEdit = isAdmin || tournament.hostClub?.managerUserId === currentUser?.id;
  const currentPlayer = currentUser
    ? await prisma.player.findUnique({ where: { userId: currentUser.id }, select: { id: true, gender: true, birthDate: true } })
    : null;
  const registrationOpen = tournament.registrationDeadline ? tournament.registrationDeadline >= new Date() : false;
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
      </section>
      <section className="detail-grid">
        <article className="list-panel full-width">
          <h2>{t.tournamentDetails}</h2>
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
          <p><strong>{t.restrictions}:</strong></p>
          {tournament.categories.map((competitionCategory) => (
            <p key={competitionCategory.id}>
              {competitionCategory.category.name}: {categoryRestrictionLabel(competitionCategory.category, {
                male: t.male,
                female: t.female,
                other: t.other,
                noRestrictions: t.noRestrictions
              })}
            </p>
          ))}
          <p className="date-row">
            <span><strong>{t.registration}:</strong> {tournament.registrationDeadline?.toLocaleDateString(locale) ?? t.noDeadline}</span>
            <span><strong>{t.start}:</strong> {tournament.startsAt?.toLocaleDateString(locale) ?? t.noDate}</span>
            <span><strong>{t.end}:</strong> {tournament.endsAt?.toLocaleDateString(locale) ?? t.noDate}</span>
          </p>
        </article>
      </section>
      <section className="tournament-category-list">
        {tournament.categories.map((competitionCategory) => {
          const isRegistered = Boolean(currentPlayer && competitionCategory.registrations.some((registration) => registration.playerId === currentPlayer.id));
          const isEligible = Boolean(
            currentPlayer &&
              canPlayerRegisterForCategory(currentPlayer, competitionCategory.category, tournament.startsAt ?? new Date())
          );

          return (
            <section className="tournament-category-section" key={competitionCategory.id}>
              <article className="list-panel full-width">
                <h2>{competitionCategory.category.name}</h2>
                <p className="muted">{t.restrictions}: {categoryRestrictionLabel(competitionCategory.category, {
                  male: t.male,
                  female: t.female,
                  other: t.other,
                  noRestrictions: t.noRestrictions
                })}</p>
                <h3>{t.participants}</h3>
                {competitionCategory.registrations.length ? competitionCategory.registrations.map((registration) => (
                  <div className="participant-line" key={registration.id}>
                    <span><Link href={`/players/${registration.playerId}`}>{registration.playerNameAtRegistration}</Link> · {registration.clubNameAtRegistration ?? t.independent}</span>
                    {seedsByCategory.has(`${competitionCategory.id}:${registration.playerId}`) ? (
                      <span className="seed-badge">#{seedsByCategory.get(`${competitionCategory.id}:${registration.playerId}`)} {t.seeds}</span>
                    ) : null}
                  </div>
                )) : <p className="muted">{t.noRegisteredPlayers}</p>}
                {currentPlayer && registrationOpen && !isRegistered && isEligible ? (
                  <form className="compact-form" action={registerSelfForTournamentAction}>
                    <input type="hidden" name="competitionCategoryId" value={competitionCategory.id} />
                    <button type="submit">{t.registerMyself}</button>
                  </form>
                ) : null}
              </article>
              <TournamentMatches
                competitionId={tournament.id}
                competitionCategoryId={competitionCategory.id}
                canEdit={canEdit}
                showHeading={false}
              />
            </section>
          );
        })}
      </section>
    </main>
  );
}
