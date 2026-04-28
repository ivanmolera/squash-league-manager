import Link from "next/link";
import { notFound } from "next/navigation";
import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { getDictionary } from "@/src/lib/i18n";
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
  const { t } = await getDictionary();

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
          <p className="eyebrow">{t.player}</p>
          <h1>{player.firstName} {player.lastName}</h1>
        </div>
        {canEdit ? <Link className="primary-link" href={`/players/${player.id}/edit`}>{t.edit}</Link> : null}
      </section>
      <section className="detail-grid">
        <article className="list-panel">
          <h2>{t.personalData}</h2>
          <p><strong>{t.email}:</strong> {canSeeContact ? player.user?.email ?? t.unavailable : t.privateValue}</p>
          <p><strong>{t.phone}:</strong> {canSeeContact ? player.user?.phone ?? t.notProvided : t.privateValue}</p>
          <p><strong>{t.gender}:</strong> {t[player.gender as keyof typeof t]}</p>
          <p><strong>{t.dominantHand}:</strong> {t[player.dominantHand as keyof typeof t]}</p>
          <p><strong>{t.height}:</strong> {canSeePhysical ? player.heightCm ?? t.notProvidedFemale : t.privateFemaleValue}</p>
          <p><strong>{t.weight}:</strong> {canSeePhysical ? String(player.weightKg ?? t.notProvided) : t.privateValue}</p>
          <p><strong>{t.racket}:</strong> {player.racketBrand ?? t.notProvidedFemale}</p>
        </article>
        <article className="list-panel">
          <h2>{t.clubs}</h2>
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
