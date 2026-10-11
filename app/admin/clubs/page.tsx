import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { ClubDirectoryMap } from "@/app/admin/clubs/club-directory-map";
import { Navigation } from "@/app/navigation";
import { ClubCrest } from "@/src/components/club-crest";
import { SaveConfirmation } from "@/app/leagues/[id]/edit/save-confirmation";
import { RankingCodeBadge } from "@/src/components/ranking-code-picker";
import { autonomousCommunityForClub } from "@/src/lib/autonomous-communities";
import { getCurrentUser } from "@/src/lib/auth";
import { activeClubWhere } from "@/src/lib/entity-activity";
import { getFeatureSettings } from "@/src/lib/features";
import { getDictionary } from "@/src/lib/i18n";
import { formatPlayerListName } from "@/src/lib/names";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

type ClubListItem = Prisma.ClubGetPayload<{
  include: { manager: true; managerPlayer: true; federation: { include: { ranking: true } } };
}>;

function groupClubsByCommunity(clubs: ClubListItem[], unknownLabel: string) {
  const groups = new Map<string, { code: string | null; name: string; clubs: ClubListItem[] }>();

  for (const club of clubs) {
    const community = autonomousCommunityForClub(club);
    const key = community?.code ?? "unknown";
    const group = groups.get(key) ?? {
      code: community?.code ?? null,
      name: community?.name ?? unknownLabel,
      clubs: []
    };
    group.clubs.push(club);
    groups.set(key, group);
  }

  return [...groups.values()].sort((left, right) => left.name.localeCompare(right.name));
}

export default async function ClubsPage({
  searchParams
}: {
  searchParams?: Promise<{ clubError?: string; saved?: string }>;
}) {
  const query = await searchParams;
  const [clubs, currentUser, dictionary, features] = await Promise.all([
    prisma.club.findMany({
      where: activeClubWhere,
      include: { manager: true, managerPlayer: true, federation: { include: { ranking: true } } },
      orderBy: [{ province: "asc" }, { name: "asc" }]
    }),
    getCurrentUser(),
    getDictionary(),
    getFeatureSettings()
  ]);
  const { t } = dictionary;
  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));
  const clubGroups = groupClubsByCommunity(clubs, t.unknownAutonomousCommunity);
  const hasGeocodedClubs = features.club_maps && clubs.some((club) =>
    typeof club.latitude === "number" &&
    Number.isFinite(club.latitude) &&
    typeof club.longitude === "number" &&
    Number.isFinite(club.longitude)
  );

  return (
    <main className="app-shell">
      <Navigation />
      <section className="page-heading">
        <h1>{t.clubs}</h1>
        {query?.saved ? <SaveConfirmation key={query.saved} message={t.savedChanges} /> : null}
        {!isAdmin ? <p className="muted">{t.signInToEditClub}</p> : null}
        {isAdmin ? (
          <div className="heading-actions">
            <Link className="primary-link" href="/admin/clubs/new">{t.createNewClub}</Link>
            <Link className="secondary-link" href="/admin/visibility?kind=clubs">{t.entityActivity}</Link>
          </div>
        ) : null}
      </section>
      <section className={`club-directory-grid full-width${hasGeocodedClubs ? "" : " without-map"}`}>
        <div className="list-panel club-directory-list">
          {query?.clubError ? <p className="warning-box">{t.clubFormError}</p> : null}
          {clubGroups.map((group) => (
            <section className="club-community-group" key={group.code ?? "unknown"}>
              <h3>
                {group.code ? <RankingCodeBadge code={group.code} /> : null}
              </h3>
              {group.clubs.map((club) => {
                const address = club.address ?? t.noAddress;
                const city = club.city ?? t.noCity;
                const managerName = club.managerPlayer
                  ? formatPlayerListName(club.managerPlayer)
                  : club.manager?.displayName;
                const canEdit = isAdmin || club.managerUserId === currentUser?.id;

                return (
                  <article className="club-list-row" key={club.id}>
                    <div>
                      <strong>
                        <Link className="club-list-name" href={`/clubs/${club.id}`}>
                          <ClubCrest logoUrl={club.logoUrl} clubName={club.name} size="tiny" />
                          {club.name}
                        </Link>
                      </strong>
                      <span className="club-list-address">{address}</span>
                      <span className="club-list-city">{city}</span>
                      {managerName ? <span className="club-list-manager">{t.assignedManager}: {managerName}</span> : null}
                    </div>
                    {canEdit ? <Link className="secondary-link" href={`/clubs/${club.id}/edit`}>{t.edit}</Link> : null}
                  </article>
                );
              })}
            </section>
          ))}
        </div>
        {hasGeocodedClubs ? <ClubDirectoryMap clubs={clubs} /> : null}
      </section>
    </main>
  );
}
