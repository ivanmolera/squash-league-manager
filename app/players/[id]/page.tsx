import Link from "next/link";
import { notFound } from "next/navigation";
import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PlayerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [player, currentUser] = await Promise.all([
    prisma.player.findUnique({
      where: { id },
      include: { user: true, memberships: { include: { club: true, season: true } } }
    }),
    getCurrentUser()
  ]);

  if (!player) notFound();

  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));
  const canEdit = isAdmin || player.userId === currentUser?.id;
  const canSeeContact = canEdit || player.showContactPublic;
  const canSeePhysical = canEdit || player.showPhysicalPublic;

  return (
    <main className="app-shell">
      <Navigation />
      <section className="detail-header">
        <div>
          <p className="eyebrow">Jugador</p>
          <h1>{player.firstName} {player.lastName}</h1>
        </div>
        {canEdit ? <Link className="primary-link" href={`/players/${player.id}/edit`}>Editar</Link> : null}
      </section>
      <section className="detail-grid">
        <article className="list-panel">
          <h2>Datos personales</h2>
          <p><strong>Email:</strong> {canSeeContact ? player.user?.email ?? "No disponible" : "Privado"}</p>
          <p><strong>Telefono:</strong> {canSeeContact ? player.user?.phone ?? "No informado" : "Privado"}</p>
          <p><strong>Sexo:</strong> {player.gender}</p>
          <p><strong>Mano dominante:</strong> {player.dominantHand}</p>
          <p><strong>Altura:</strong> {canSeePhysical ? player.heightCm ?? "No informada" : "Privada"}</p>
          <p><strong>Peso:</strong> {canSeePhysical ? String(player.weightKg ?? "No informado") : "Privado"}</p>
          <p><strong>Raqueta:</strong> {player.racketBrand ?? "No informada"}</p>
        </article>
        <article className="list-panel">
          <h2>Clubes</h2>
          {player.memberships.map((membership) => (
            <p key={membership.id}>
              {membership.clubNameAtThatTime} · {membership.season.name}
            </p>
          ))}
        </article>
      </section>
    </main>
  );
}
