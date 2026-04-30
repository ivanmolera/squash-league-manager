import Link from "next/link";
import { saveClubAction } from "@/app/admin/actions";
import { Navigation } from "@/app/navigation";
import { ClubCrest } from "@/src/components/club-crest";
import { getCurrentUser } from "@/src/lib/auth";
import { getDictionary } from "@/src/lib/i18n";
import { formatUserManagerName } from "@/src/lib/names";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ClubsPage() {
  const [clubs, managers, currentUser, dictionary] = await Promise.all([
    prisma.club.findMany({ include: { manager: true }, orderBy: [{ province: "asc" }, { name: "asc" }] }),
    prisma.user.findMany({ include: { player: true }, orderBy: { email: "asc" } }),
    getCurrentUser(),
    getDictionary()
  ]);
  const { t } = dictionary;
  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));

  return (
    <main className="app-shell">
      <Navigation />
      <section className="page-heading">
        <p className="eyebrow">{t.admin}</p>
        <h1>{t.clubs}</h1>
        {!isAdmin ? <p className="muted">{t.signInToEditClub}</p> : null}
      </section>
      <section className="list-panel full-width">
        <h2>{t.clubList}</h2>
        {clubs.map((club) => {
          const address = `${club.address ?? t.noAddress}, ${club.city ?? t.noCity} (${club.province ?? t.noProvince})`;

          return isAdmin || club.managerUserId === currentUser?.id ? (
            <article className="row-card" key={club.id}>
              <strong>
                <Link className="club-list-name" href={`/clubs/${club.id}`}>
                  <ClubCrest logoUrl={club.logoUrl} clubName={club.name} size="tiny" />
                  {club.name}
                </Link>
              </strong>
              <span>{address}</span>
              <Link className="secondary-link" href={`/clubs/${club.id}/edit`}>{t.edit}</Link>
            </article>
          ) : (
            <article className="row-card" key={club.id}>
              <strong>
                <Link className="club-list-name" href={`/clubs/${club.id}`}>
                  <ClubCrest logoUrl={club.logoUrl} clubName={club.name} size="tiny" />
                  {club.name}
                </Link>
              </strong>
              <span>{address}</span>
            </article>
          );
        })}
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
  club?: { name?: string; city?: string | null; province?: string | null; address?: string | null; websiteUrl?: string | null; logoUrl?: string | null; managerUserId?: string | null; showContactPublic?: boolean };
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
