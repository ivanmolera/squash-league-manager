import Link from "next/link";
import { saveClubAction } from "@/app/admin/actions";
import { ClubDirectoryMap } from "@/app/admin/clubs/club-directory-map";
import { Navigation } from "@/app/navigation";
import { ClubCrest } from "@/src/components/club-crest";
import { RankingCodeBadge } from "@/src/components/ranking-code-picker";
import { autonomousCommunityForLocation } from "@/src/lib/autonomous-communities";
import { getCurrentUser } from "@/src/lib/auth";
import { getFeatureSettings } from "@/src/lib/features";
import { getDictionary } from "@/src/lib/i18n";
import { formatUserManagerName } from "@/src/lib/names";
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
  const [clubs, managers, federations, currentUser, dictionary, features] = await Promise.all([
    prisma.club.findMany({ include: { manager: true }, orderBy: [{ province: "asc" }, { name: "asc" }] }),
    prisma.user.findMany({ include: { player: true }, orderBy: { email: "asc" } }),
    prisma.federation.findMany({ orderBy: { name: "asc" } }),
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
      {isAdmin ? (
        <section className="work-grid">
          <form className="admin-form" action={saveClubAction}>
            <h2>{t.newClub}</h2>
            <ClubFields managers={managers} federations={federations} isAdmin={isAdmin} labels={t} />
            <button type="submit">{t.createClub}</button>
          </form>
        </section>
      ) : null}
    </main>
  );
}

function ClubFields({
  club,
  managers,
  federations,
  isAdmin,
  labels
}: {
  club?: { name?: string; city?: string | null; province?: string | null; address?: string | null; postalCode?: string | null; availableCourts?: number; phone?: string | null; managesCourtBookings?: boolean; websiteUrl?: string | null; logoUrl?: string | null; managerUserId?: string | null; federationId?: string | null; showContactPublic?: boolean; closedDays?: Array<{ closedOn: Date }> };
  managers: Array<{ id: string; email: string; displayName: string | null; player?: { firstName: string; lastName: string } | null }>;
  federations: Array<{ id: string; name: string; code: string }>;
  isAdmin: boolean;
  labels: Record<string, string>;
}) {
  return (
    <>
      <div className="club-logo-edit-row">
        <ClubCrest logoUrl={club?.logoUrl} clubName={club?.name ?? "Club"} size="small" />
        <label>{labels.logo}<input name="clubLogo" type="file" accept="image/*" /></label>
      </div>
      <label>{labels.name}<input name="name" defaultValue={club?.name ?? ""} required /></label>
      <div className="form-row">
        <label>{labels.city}<input name="city" defaultValue={club?.city ?? ""} /></label>
        <label>{labels.province}<input name="province" defaultValue={club?.province ?? ""} /></label>
      </div>
      <label>{labels.postalCode}<input name="postalCode" defaultValue={club?.postalCode ?? ""} /></label>
      <label>{labels.availableCourts}<input name="availableCourts" type="number" min="0" defaultValue={club?.availableCourts ?? 0} /></label>
      <label className="check-line">
        <input name="managesCourtBookings" type="checkbox" defaultChecked={club?.managesCourtBookings ?? false} />
        {labels.manageCourtBookingsWithApp}
      </label>
      <div className="form-row">
        <label>{labels.clubPhone}<input name="phone" type="tel" defaultValue={club?.phone ?? ""} /></label>
        <label>{labels.website}<input name="websiteUrl" type="url" defaultValue={club?.websiteUrl ?? ""} /></label>
      </div>
      <div className="form-row">
        <label>{labels.address}<input name="address" defaultValue={club?.address ?? ""} /></label>
        <label>{labels.closedDays}<textarea name="closedDays" defaultValue={club?.closedDays?.map((day) => day.closedOn.toISOString().slice(0, 10)).join("\n") ?? ""} placeholder="2026-01-01" /></label>
      </div>
      <label>{labels.assignedManager}
        <select name="managerUserId" defaultValue={club?.managerUserId ?? ""} disabled={!isAdmin}>
          <option value="">{labels.noManager}</option>
          {managers.map((manager) => (
            <option key={manager.id} value={manager.id}>
              {formatUserManagerName(manager)}
            </option>
          ))}
        </select>
      </label>
      <label>{labels.federation}
        <select name="federationId" defaultValue={club?.federationId ?? ""} disabled={!isAdmin}>
          <option value="">{labels.noFederation}</option>
          {federations.map((federation) => (
            <option key={federation.id} value={federation.id}>
              {federation.name} ({federation.code})
            </option>
          ))}
        </select>
      </label>
      <label className="check-line">
        <input name="showContactPublic" type="checkbox" defaultChecked={club?.showContactPublic ?? true} />
        {labels.showClubContactPublic}
      </label>
    </>
  );
}
