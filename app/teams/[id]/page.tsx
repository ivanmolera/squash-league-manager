import Link from "next/link";
import { notFound } from "next/navigation";
import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

export default async function TeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [team, currentUser] = await Promise.all([
    prisma.team.findUnique({
      where: { id },
      include: {
        club: true,
        rosters: { include: { player: true }, orderBy: [{ playerNameAtThatTime: "asc" }] }
      }
    }),
    getCurrentUser()
  ]);

  if (!team) notFound();

  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));
  const canEdit = isAdmin || team.club.managerUserId === currentUser?.id;
  const canSeeRoster = canEdit || team.showRosterPublic;

  return (
    <main className="app-shell">
      <Navigation />
      <section className="detail-header">
        <div>
          <p className="eyebrow">Equipo</p>
          <h1>{team.name}</h1>
        </div>
        {canEdit ? <Link className="primary-link" href={`/teams/${team.id}/edit`}>Editar</Link> : null}
      </section>
      <section className="detail-grid">
        <article className="list-panel">
          <h2>Datos del equipo</h2>
          <p><strong>Club:</strong> <Link href={`/clubs/${team.clubId}`}>{team.club.name}</Link></p>
          <p><strong>Nombre historico club:</strong> {team.clubNameAtCreation}</p>
        </article>
        <article className="list-panel">
          <h2>Jugadores</h2>
          {canSeeRoster ? team.rosters.map((roster) => (
            <p key={roster.id}>
              <Link href={`/players/${roster.playerId}`}>{roster.playerNameAtThatTime}</Link>
            </p>
          )) : <p>Plantilla privada.</p>}
        </article>
      </section>
    </main>
  );
}
