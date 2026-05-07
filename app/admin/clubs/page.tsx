import Link from "next/link";
import { ClubDirectoryMap } from "@/app/admin/clubs/club-directory-map";
import { Navigation } from "@/app/navigation";
import { ClubCrest } from "@/src/components/club-crest";
import { RankingCodeBadge } from "@/src/components/ranking-code-picker";
import { autonomousCommunityForLocation } from "@/src/lib/autonomous-communities";
import { getCurrentUser } from "@/src/lib/auth";
import { getFeatureSettings } from "@/src/lib/features";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

type ClubListItem = Awaited<ReturnType<typeof prisma.club.findMany>>[number];

function groupClubsByCommunity(clubs: ClubListItem[], unknownLabel: string) {
  const groups = new Map<string, { code: string | null; name: string; clubs: ClubListItem[] }>();

  for (const club of clubs) {
    const community = autonomousCommunityForLocation(club);
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
  searchParams?: Promise<{ clubError?: string }>;
}) {
  const query = await searchParams;
  const [clubs, currentUser, dictionary, features] = await Promise.all([
    prisma.club.findMany({ include: { manager: true }, orderBy: [{ province: "asc" }, { name: "asc" }] }),
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
        <p className="eyebrow">{t.admin}</p>
        <h1>{t.clubs}</h1>
        {!isAdmin ? <p className="muted">{t.signInToEditClub}</p> : null}
        {isAdmin ? (
          <div className="heading-actions">
            <Link className="primary-link" href="/admin/clubs/new">{t.createNewClub}</Link>
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

                return isAdmin || club.managerUserId === currentUser?.id ? (
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
                    </div>
                    <Link className="secondary-link" href={`/clubs/${club.id}/edit`}>{t.edit}</Link>
                  </article>
                ) : (
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
                    </div>
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
