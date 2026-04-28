import Link from "next/link";
import { notFound } from "next/navigation";
import { registerSelfForTournamentAction } from "@/app/admin/actions";
import { Navigation } from "@/app/navigation";
import { TournamentMatches } from "@/app/tournaments/[id]/tournament-matches";
import { getCurrentUser } from "@/src/lib/auth";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

export default async function TournamentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [tournament, currentUser] = await Promise.all([
    prisma.competition.findUnique({
      where: { id },
      include: {
        hostClub: true,
        categories: { include: { category: true, seeds: true, drawEntries: true, registrations: { include: { player: true } } } }
      }
    }),
    getCurrentUser()
  ]);
  const { t } = await getDictionary();

  if (!tournament || tournament.type !== "tournament") notFound();

  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));
  const canEdit = isAdmin || tournament.hostClub?.managerUserId === currentUser?.id;
  const currentPlayer = currentUser
    ? await prisma.player.findUnique({ where: { userId: currentUser.id }, select: { id: true } })
    : null;
  const registrationOpen = tournament.registrationDeadline ? tournament.registrationDeadline >= new Date() : false;
  const seeds = tournament.categories.flatMap((category) => category.seeds).sort((left, right) => left.seedNumber - right.seedNumber);
  const drawEntries = tournament.categories
    .flatMap((category) => category.drawEntries)
    .sort((left, right) => left.bracketPosition - right.bracketPosition);

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
        <article className="list-panel">
          <h2>{t.tournamentDetails}</h2>
          <p><strong>{t.club}:</strong> {tournament.hostClub ? <Link href={`/clubs/${tournament.hostClub.id}`}>{tournament.hostClub.name}</Link> : t.noVenue}</p>
          <p><strong>{t.referee}:</strong> {tournament.refereeName ?? t.notProvided}</p>
          <p><strong>{t.matchFormat}:</strong> {tournament.bestOfSets === 3 ? t.bestOf3 : t.bestOf5}</p>
          <p><strong>{t.description}:</strong> {tournament.description ?? t.notProvidedFemale}</p>
          <p><strong>{t.registration}:</strong> {tournament.registrationDeadline?.toLocaleDateString("es-ES") ?? t.noDeadline}</p>
          <p><strong>{t.start}:</strong> {tournament.startsAt?.toLocaleDateString("es-ES") ?? t.noDate}</p>
          <p><strong>{t.end}:</strong> {tournament.endsAt?.toLocaleDateString("es-ES") ?? t.noDate}</p>
        </article>
        <article className="list-panel">
          <h2>Inscripción</h2>
          {tournament.categories.map((competitionCategory) => {
            const isRegistered = Boolean(currentPlayer && competitionCategory.registrations.some((registration) => registration.playerId === currentPlayer.id));

            return (
              <div className="standing-block" key={competitionCategory.id}>
                <h3>{competitionCategory.category.name}</h3>
                {competitionCategory.registrations.length ? competitionCategory.registrations.map((registration) => (
                  <p key={registration.id}>
                    <Link href={`/players/${registration.playerId}`}>{registration.playerNameAtRegistration}</Link> · {registration.clubNameAtRegistration ?? t.independent}
                  </p>
                )) : <p className="muted">Sin inscritos.</p>}
                {currentPlayer && registrationOpen && !isRegistered ? (
                  <form className="compact-form" action={registerSelfForTournamentAction}>
                    <input type="hidden" name="competitionCategoryId" value={competitionCategory.id} />
                    <button type="submit">Inscribirme</button>
                  </form>
                ) : null}
              </div>
            );
          })}
        </article>
        <article className="list-panel">
          <h2>{t.seeds}</h2>
          {seeds.length ? seeds.map((seed) => <p key={seed.id}>#{seed.seedNumber} {seed.playerNameAtTime}</p>) : <p>{t.noSeeds}</p>}
        </article>
        <article className="list-panel">
          <h2>{t.draw}</h2>
          {drawEntries.map((entry) => (
            <p key={entry.id}>#{entry.bracketPosition} {entry.isBye ? "BYE" : entry.playerNameAtTime}</p>
          ))}
        </article>
      </section>
      <TournamentMatches competitionId={tournament.id} canEdit={canEdit} />
    </main>
  );
}
