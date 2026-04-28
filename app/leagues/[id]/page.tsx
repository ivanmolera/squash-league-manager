import Link from "next/link";
import { notFound } from "next/navigation";
import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

export default async function LeagueDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [league, currentUser] = await Promise.all([
    prisma.competition.findUnique({
      where: { id },
      include: {
        season: true,
        categories: { include: { category: true } },
        participants: {
          include: {
            competitionCategory: { include: { category: true } },
            player: true,
            club: true
          }
        }
      }
    }),
    getCurrentUser()
  ]);

  if (!league || !["individual_league", "team_league"].includes(league.type)) notFound();

  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));
  const participants = [...league.participants].sort((left, right) => {
    const leftCategory = left.competitionCategory.category.name;
    const rightCategory = right.competitionCategory.category.name;
    const categorySort = leftCategory.localeCompare(rightCategory, "es");
    if (categorySort !== 0) return categorySort;
    const leftName = left.player ? `${left.player.lastName}, ${left.player.firstName}` : left.club?.name ?? "";
    const rightName = right.player ? `${right.player.lastName}, ${right.player.firstName}` : right.club?.name ?? "";
    return leftName.localeCompare(rightName, "es");
  });

  return (
    <main className="app-shell">
      <Navigation />
      <section className="detail-header">
        <div>
          <p className="eyebrow">Liga</p>
          <h1>{league.name}</h1>
        </div>
        {isAdmin ? <Link className="primary-link" href={`/leagues/${league.id}/edit`}>Editar</Link> : null}
      </section>
      <section className="detail-grid">
        <article className="list-panel">
          <h2>Datos de la liga</h2>
          <p><strong>Tipo:</strong> {league.type === "individual_league" ? "Individual" : "Equipos"}</p>
          <p><strong>Descripcion:</strong> {league.description ?? "No informada"}</p>
          <p><strong>Temporada:</strong> {league.season.name}</p>
          <p><strong>Limite inscripcion:</strong> {league.registrationDeadline?.toLocaleDateString("es-ES") ?? "Sin limite"}</p>
          <p><strong>Inicio:</strong> {league.startsAt?.toLocaleDateString("es-ES") ?? "Sin fecha"}</p>
          <p><strong>Fin:</strong> {league.endsAt?.toLocaleDateString("es-ES") ?? "Sin fecha"}</p>
        </article>
        <article className="list-panel">
          <h2>Participantes</h2>
          {participants.map((participant) => (
            <p key={participant.id}>
              <span>{participant.competitionCategory.category.name}</span> ·{" "}
              {participant.player ? (
                <Link href={`/players/${participant.player.id}`}>{participant.player.lastName}, {participant.player.firstName}</Link>
              ) : participant.club ? (
                <Link href={`/clubs/${participant.club.id}`}>{participant.club.name}</Link>
              ) : "Participante sin datos"}
            </p>
          ))}
        </article>
      </section>
    </main>
  );
}
