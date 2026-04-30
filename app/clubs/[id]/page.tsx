import Link from "next/link";
import { notFound } from "next/navigation";
import { Navigation } from "@/app/navigation";
import { ClubCrest } from "@/src/components/club-crest";
import { RankingCodeBadge } from "@/src/components/ranking-code-picker";
import { autonomousCommunityForLocation } from "@/src/lib/autonomous-communities";
import { getCurrentUser } from "@/src/lib/auth";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

type ClubMembership = NonNullable<Awaited<ReturnType<typeof getClub>>>["memberships"][number];

async function getClub(id: string) {
  return prisma.club.findUnique({
    where: { id },
    include: {
      manager: true,
      teams: {
        include: { rosters: { include: { player: true } } },
        orderBy: [{ name: "asc" }]
      },
      memberships: {
        include: { player: true, season: true },
        orderBy: [
          { season: { startsAt: "desc" } },
          { player: { lastName: "asc" } },
          { player: { firstName: "asc" } }
        ]
      }
    }
  });
}

function groupMembershipsBySeason(memberships: ClubMembership[]) {
  return memberships.reduce<Array<{ seasonId: string; seasonName: string; startsAt: Date | null; memberships: ClubMembership[] }>>((groups, membership) => {
    const group = groups.find((item) => item.seasonId === membership.seasonId);
    if (group) {
      group.memberships.push(membership);
    } else {
      groups.push({
        seasonId: membership.seasonId,
        seasonName: membership.season.name,
        startsAt: membership.season.startsAt,
        memberships: [membership]
      });
    }
    return groups;
  }, []);
}

function clubMapUrl(club: { name: string; address: string | null; postalCode: string | null; city: string | null; province: string | null }) {
  const query = [club.address, club.postalCode, club.city, club.province, club.name].filter(Boolean).join(", ");
  return query ? `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed` : null;
}

export default async function ClubDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [club, currentUser] = await Promise.all([
    getClub(id),
    getCurrentUser()
  ]);
  const { t } = await getDictionary();

  if (!club) notFound();

  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));
  const canEdit = isAdmin || club.managerUserId === currentUser?.id;
  const canSeeContact = canEdit || club.showContactPublic;
  const membershipsBySeason = groupMembershipsBySeason(club.memberships);
  const mapUrl = canSeeContact ? clubMapUrl(club) : null;
  const community = autonomousCommunityForLocation(club);

  return (
    <main className="app-shell">
      <Navigation />
      <section className="detail-header">
        <div className="detail-title-with-crest">
          <ClubCrest logoUrl={club.logoUrl} clubName={club.name} size="large" />
          <div>
            <p className="eyebrow">{t.club}</p>
            <h1>{club.name}</h1>
          </div>
        </div>
        {canEdit ? <Link className="primary-link" href={`/clubs/${club.id}/edit`}>{t.edit}</Link> : null}
      </section>
      <section className="detail-grid">
        <article className="list-panel">
          <h2>{t.clubDetails}</h2>
          <p>
            <strong>{t.autonomousCommunity}:</strong>{" "}
            {community ? (
              <span className="inline-badge-row"><RankingCodeBadge code={community.code} /> {community.name}</span>
            ) : t.unknownAutonomousCommunity}
          </p>
          <p><strong>{t.province}:</strong> {club.province ?? t.notProvidedFemale}</p>
          <p><strong>{t.city}:</strong> {club.city ?? t.notProvidedFemale}</p>
          <p><strong>{t.postalCode}:</strong> {club.postalCode ?? t.notProvided}</p>
          <p><strong>{t.availableCourts}:</strong> {club.availableCourts}</p>
          <p><strong>{t.address}:</strong> {canSeeContact ? club.address ?? t.notProvidedFemale : t.privateFemaleValue}</p>
          <p><strong>{t.website}:</strong> {canSeeContact ? club.websiteUrl ?? t.notProvidedFemale : t.privateFemaleValue}</p>
          <p><strong>{t.assignedManager}:</strong> {club.manager?.displayName ?? club.manager?.email ?? t.noManager}</p>
          {mapUrl ? (
            <iframe
              className="club-map"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              src={mapUrl}
              title={`${club.name} · ${t.location}`}
            />
          ) : null}
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
          {membershipsBySeason.map((group) => (
            <div className="standing-block" key={group.seasonId}>
              <h3>{group.seasonName}</h3>
              {group.memberships.map((membership) => (
                <p key={membership.id}>
                  <Link href={`/players/${membership.playerId}`}>{membership.player.lastName}, {membership.player.firstName}</Link>
                </p>
              ))}
            </div>
          ))}
        </article>
      </section>
    </main>
  );
}
