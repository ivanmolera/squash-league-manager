import Link from "next/link";
import { saveClubAction } from "@/app/admin/actions";
import { Navigation } from "@/app/navigation";
import { ClubCrest } from "@/src/components/club-crest";
import { RankingCodeBadge } from "@/src/components/ranking-code-picker";
import { autonomousCommunityForLocation } from "@/src/lib/autonomous-communities";
import { getCurrentUser } from "@/src/lib/auth";
import { getDictionary } from "@/src/lib/i18n";
import { formatUserManagerName } from "@/src/lib/names";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

const provinceCoordinates: Record<string, { lat: number; lon: number }> = {
  alacant: { lat: 38.35, lon: -0.49 },
  alava: { lat: 42.85, lon: -2.67 },
  araba: { lat: 42.85, lon: -2.67 },
  albacete: { lat: 38.99, lon: -1.86 },
  almeria: { lat: 36.84, lon: -2.46 },
  asturias: { lat: 43.36, lon: -5.85 },
  avila: { lat: 40.66, lon: -4.70 },
  badajoz: { lat: 38.88, lon: -6.97 },
  barcelona: { lat: 41.39, lon: 2.17 },
  bizkaia: { lat: 43.26, lon: -2.93 },
  burgos: { lat: 42.34, lon: -3.70 },
  caceres: { lat: 39.48, lon: -6.37 },
  cadiz: { lat: 36.53, lon: -6.29 },
  cantabria: { lat: 43.46, lon: -3.81 },
  castello: { lat: 39.99, lon: -0.05 },
  castellon: { lat: 39.99, lon: -0.05 },
  ceuta: { lat: 35.89, lon: -5.32 },
  ciudadreal: { lat: 38.99, lon: -3.93 },
  cordoba: { lat: 37.88, lon: -4.78 },
  cuenca: { lat: 40.07, lon: -2.14 },
  girona: { lat: 41.98, lon: 2.82 },
  granada: { lat: 37.18, lon: -3.60 },
  guadalajara: { lat: 40.63, lon: -3.17 },
  gipuzkoa: { lat: 43.32, lon: -1.98 },
  huelva: { lat: 37.26, lon: -6.94 },
  huesca: { lat: 42.14, lon: -0.41 },
  illesbalears: { lat: 39.57, lon: 2.65 },
  jaen: { lat: 37.78, lon: -3.79 },
  larioja: { lat: 42.47, lon: -2.45 },
  laspalmas: { lat: 28.12, lon: -15.43 },
  leon: { lat: 42.60, lon: -5.57 },
  lleida: { lat: 41.62, lon: 0.62 },
  lugo: { lat: 43.01, lon: -7.56 },
  madrid: { lat: 40.42, lon: -3.70 },
  malaga: { lat: 36.72, lon: -4.42 },
  melilla: { lat: 35.29, lon: -2.94 },
  murcia: { lat: 37.98, lon: -1.13 },
  navarra: { lat: 42.82, lon: -1.64 },
  ourense: { lat: 42.34, lon: -7.86 },
  palencia: { lat: 42.01, lon: -4.53 },
  pontevedra: { lat: 42.43, lon: -8.64 },
  salamanca: { lat: 40.97, lon: -5.66 },
  segovia: { lat: 40.95, lon: -4.12 },
  sevilla: { lat: 37.39, lon: -5.99 },
  soria: { lat: 41.76, lon: -2.47 },
  tarragona: { lat: 41.12, lon: 1.24 },
  tenerife: { lat: 28.46, lon: -16.25 },
  teruel: { lat: 40.34, lon: -1.11 },
  toledo: { lat: 39.86, lon: -4.03 },
  valencia: { lat: 39.47, lon: -0.38 },
  valladolid: { lat: 41.65, lon: -4.72 },
  zamora: { lat: 41.50, lon: -5.74 },
  zaragoza: { lat: 41.65, lon: -0.89 }
};

function normalizeLocation(value: string | null | undefined) {
  return value
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "") ?? "";
}

function mapPosition(club: { latitude: number | null; longitude: number | null; province: string | null; city: string | null }) {
  const coordinates = club.latitude !== null && club.longitude !== null
    ? { lat: club.latitude, lon: club.longitude }
    : provinceCoordinates[normalizeLocation(club.province)] ??
    provinceCoordinates[normalizeLocation(club.city)] ??
    { lat: 40.42, lon: -3.70 };
  const bounds = { minLon: -10, maxLon: 5, minLat: 35.4, maxLat: 44.3 };

  return {
    left: `${((coordinates.lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * 100}%`,
    top: `${((bounds.maxLat - coordinates.lat) / (bounds.maxLat - bounds.minLat)) * 100}%`
  };
}

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
  const [clubs, managers, currentUser, dictionary] = await Promise.all([
    prisma.club.findMany({ include: { manager: true }, orderBy: [{ province: "asc" }, { name: "asc" }] }),
    prisma.user.findMany({ include: { player: true }, orderBy: { email: "asc" } }),
    getCurrentUser(),
    getDictionary()
  ]);
  const { t } = dictionary;
  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));
  const clubGroups = groupClubsByCommunity(clubs, t.unknownAutonomousCommunity);

  return (
    <main className="app-shell">
      <Navigation />
      <section className="page-heading">
        <p className="eyebrow">{t.admin}</p>
        <h1>{t.clubs}</h1>
        {!isAdmin ? <p className="muted">{t.signInToEditClub}</p> : null}
      </section>
      <section className="club-directory-grid full-width">
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
        <div className="club-directory-map">
          <iframe
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            src="https://www.openstreetmap.org/export/embed.html?bbox=-10%2C35.4%2C5%2C44.3&layer=mapnik"
            title={`${t.clubs} · ${t.location}`}
          />
          <div className="club-map-markers" aria-hidden="true">
            {clubs.map((club) => (
              <span key={club.id} style={mapPosition(club)} title={club.name} />
            ))}
          </div>
        </div>
      </section>
      {isAdmin ? (
        <section className="work-grid">
          <form className="admin-form" action={saveClubAction}>
            <h2>{t.newClub}</h2>
            <ClubFields managers={managers} isAdmin={isAdmin} labels={t} />
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
  isAdmin,
  labels
}: {
  club?: { name?: string; city?: string | null; province?: string | null; address?: string | null; postalCode?: string | null; availableCourts?: number; websiteUrl?: string | null; logoUrl?: string | null; managerUserId?: string | null; showContactPublic?: boolean };
  managers: Array<{ id: string; email: string; displayName: string | null; player?: { firstName: string; lastName: string } | null }>;
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
      <div className="form-row">
        <label>{labels.website}<input name="websiteUrl" type="url" defaultValue={club?.websiteUrl ?? ""} /></label>
        <label>{labels.address}<input name="address" defaultValue={club?.address ?? ""} /></label>
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
      <label className="check-line">
        <input name="showContactPublic" type="checkbox" defaultChecked={club?.showContactPublic ?? true} />
        {labels.showClubContactPublic}
      </label>
    </>
  );
}
