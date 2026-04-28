import Link from "next/link";
import { notFound } from "next/navigation";
import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

export default async function TournamentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [tournament, currentUser] = await Promise.all([
    prisma.competition.findUnique({
      where: { id },
      include: {
        hostClub: true,
        categories: { include: { category: true, seeds: true, drawEntries: true } },
        participants: {
          include: {
            competitionCategory: { include: { category: true } },
            player: true
          }
        }
      }
    }),
    getCurrentUser()
  ]);

  if (!tournament || tournament.type !== "tournament") notFound();

  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));
  const canEdit = isAdmin || tournament.hostClub?.managerUserId === currentUser?.id;
  const participants = [...tournament.participants].sort((left, right) => {
    const categorySort = left.competitionCategory.category.name.localeCompare(right.competitionCategory.category.name, "es");
    if (categorySort !== 0) return categorySort;
    const leftName = left.player ? `${left.player.lastName}, ${left.player.firstName}` : "";
    const rightName = right.player ? `${right.player.lastName}, ${right.player.firstName}` : "";
    return leftName.localeCompare(rightName, "es");
  });
  const seeds = tournament.categories.flatMap((category) => category.seeds).sort((left, right) => left.seedNumber - right.seedNumber);
  const drawEntries = tournament.categories
    .flatMap((category) => category.drawEntries)
    .sort((left, right) => left.bracketPosition - right.bracketPosition);

  return (
    <main className="app-shell">
      <Navigation />
      <section className="detail-header">
        <div>
          <p className="eyebrow">Torneo</p>
          <h1>{tournament.name}</h1>
        </div>
        {canEdit ? <Link className="primary-link" href={`/tournaments/${tournament.id}/edit`}>Editar</Link> : null}
      </section>
      <section className="detail-grid">
        <article className="list-panel">
          <h2>Datos del torneo</h2>
          <p><strong>Club sede:</strong> {tournament.hostClub ? <Link href={`/clubs/${tournament.hostClub.id}`}>{tournament.hostClub.name}</Link> : "Sin sede"}</p>
          <p><strong>Descripcion:</strong> {tournament.description ?? "No informada"}</p>
          <p><strong>Limite inscripcion:</strong> {tournament.registrationDeadline?.toLocaleDateString("es-ES") ?? "Sin limite"}</p>
          <p><strong>Inicio:</strong> {tournament.startsAt?.toLocaleDateString("es-ES") ?? "Sin fecha"}</p>
          <p><strong>Fin:</strong> {tournament.endsAt?.toLocaleDateString("es-ES") ?? "Sin fecha"}</p>
        </article>
        <article className="list-panel">
          <h2>Participantes</h2>
          {participants.map((participant) => (
            <p key={participant.id}>
              <span>{participant.competitionCategory.category.name}</span> ·{" "}
              {participant.player ? <Link href={`/players/${participant.player.id}`}>{participant.player.lastName}, {participant.player.firstName}</Link> : "Jugador sin datos"}
            </p>
          ))}
        </article>
        <article className="list-panel">
          <h2>Cabezas de serie</h2>
          {seeds.length ? seeds.map((seed) => <p key={seed.id}>#{seed.seedNumber} {seed.playerNameAtTime}</p>) : <p>Sin cabezas de serie.</p>}
        </article>
        <article className="list-panel">
          <h2>Cuadro</h2>
          {drawEntries.map((entry) => (
            <p key={entry.id}>#{entry.bracketPosition} {entry.isBye ? "BYE" : entry.playerNameAtTime}</p>
          ))}
        </article>
      </section>
    </main>
  );
}
