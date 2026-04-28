import Link from "next/link";
import { notFound } from "next/navigation";
import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ClubDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [club, currentUser] = await Promise.all([
    prisma.club.findUnique({
      where: { id },
      include: { manager: true, teams: { include: { rosters: { include: { player: true } }, } } }
    }),
    getCurrentUser()
  ]);

  if (!club) notFound();

  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));
  const canEdit = isAdmin || club.managerUserId === currentUser?.id;
  const canSeeContact = canEdit || club.showContactPublic;

  return (
    <main className="app-shell">
      <Navigation />
      <section className="detail-header">
        <div>
          <p className="eyebrow">Club</p>
          <h1>{club.name}</h1>
        </div>
        {canEdit ? <Link className="primary-link" href={`/clubs/${club.id}/edit`}>Editar</Link> : null}
      </section>
      <section className="detail-grid">
        <article className="list-panel">
          <h2>Datos del club</h2>
          <p><strong>Provincia:</strong> {club.province ?? "No informada"}</p>
          <p><strong>Ciudad:</strong> {club.city ?? "No informada"}</p>
          <p><strong>Direccion:</strong> {canSeeContact ? club.address ?? "No informada" : "Privada"}</p>
          <p><strong>Web:</strong> {canSeeContact ? club.websiteUrl ?? "No informada" : "Privada"}</p>
          <p><strong>Manager:</strong> {club.manager?.displayName ?? club.manager?.email ?? "No asignado"}</p>
        </article>
        <article className="list-panel">
          <h2>Equipos</h2>
          {club.teams.map((team) => (
            <p key={team.id}>
              <Link href={`/teams/${team.id}`}>{team.name}</Link> · {team.rosters.length} jugadores
            </p>
          ))}
        </article>
      </section>
    </main>
  );
}
