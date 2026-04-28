import Link from "next/link";
import { notFound } from "next/navigation";
import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ClubDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [club, currentUser] = await Promise.all([
    prisma.club.findUnique({
      where: { id },
      include: {
        manager: true,
        teams: {
          include: { rosters: { include: { player: true } } },
          orderBy: [{ name: "asc" }]
        },
        memberships: {
          include: { player: true, season: true },
          orderBy: [{ player: { lastName: "asc" } }, { player: { firstName: "asc" } }]
        }
      }
    }),
    getCurrentUser()
  ]);
  const { t } = await getDictionary();

  if (!club) notFound();

  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));
  const canEdit = isAdmin || club.managerUserId === currentUser?.id;
  const canSeeContact = canEdit || club.showContactPublic;

  return (
    <main className="app-shell">
      <Navigation />
      <section className="detail-header">
        <div>
          <p className="eyebrow">{t.club}</p>
          <h1>{club.name}</h1>
        </div>
        {canEdit ? <Link className="primary-link" href={`/clubs/${club.id}/edit`}>{t.edit}</Link> : null}
      </section>
      <section className="detail-grid">
        <article className="list-panel">
          <h2>{t.clubDetails}</h2>
          <p><strong>{t.province}:</strong> {club.province ?? t.notProvidedFemale}</p>
          <p><strong>{t.city}:</strong> {club.city ?? t.notProvidedFemale}</p>
          <p><strong>{t.address}:</strong> {canSeeContact ? club.address ?? t.notProvidedFemale : t.privateFemaleValue}</p>
          <p><strong>{t.website}:</strong> {canSeeContact ? club.websiteUrl ?? t.notProvidedFemale : t.privateFemaleValue}</p>
          <p><strong>{t.assignedManager}:</strong> {club.manager?.displayName ?? club.manager?.email ?? t.noManager}</p>
        </article>
        <article className="list-panel">
          <h2>{t.teams}</h2>
          {club.teams.map((team) => (
            <p key={team.id}>
              <Link href={`/teams/${team.id}`}>{team.name}</Link> · {team.rosters.length} {t.players.toLowerCase()}
            </p>
          ))}
        </article>
        <article className="list-panel">
          <h2>{t.clubPlayers}</h2>
          {club.memberships.map((membership) => (
            <p key={membership.id}>
              <Link href={`/players/${membership.playerId}`}>{membership.player.lastName}, {membership.player.firstName}</Link> · {membership.season.name}
            </p>
          ))}
        </article>
      </section>
    </main>
  );
}
