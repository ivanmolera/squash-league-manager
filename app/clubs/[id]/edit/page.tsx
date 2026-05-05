import { notFound } from "next/navigation";
import { removePlayerFromClubAction, saveClubAction } from "@/app/admin/actions";
import { Navigation } from "@/app/navigation";
import { ClubCrest } from "@/src/components/club-crest";
import { getCurrentUser } from "@/src/lib/auth";
import { getDictionary } from "@/src/lib/i18n";
import { formatUserManagerName } from "@/src/lib/names";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

export default async function EditClubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [club, federations, currentUser, dictionary] = await Promise.all([
    prisma.club.findUnique({
      where: { id },
      include: {
        closedDays: { orderBy: { closedOn: "asc" } },
        memberships: {
          where: { toDate: null },
          include: { player: { include: { user: true } } },
          orderBy: [{ player: { lastName: "asc" } }, { player: { firstName: "asc" } }]
        }
      }
    }),
    prisma.federation.findMany({ orderBy: { name: "asc" } }),
    getCurrentUser(),
    getDictionary()
  ]);
  const { t } = dictionary;
  if (!club) notFound();
  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));
  if (!isAdmin && club.managerUserId !== currentUser?.id) notFound();
  const managers = club.memberships
    .map((membership) => membership.player.user ? { ...membership.player.user, player: membership.player } : null)
    .filter(Boolean)
    .filter((user, index, users) => users.findIndex((item) => item?.id === user?.id) === index);

  return (
    <main className="app-shell">
      <Navigation />
      <section className="work-grid">
        <form className="admin-form" action={saveClubAction}>
          <h1>{t.editClub}</h1>
          <input type="hidden" name="clubId" value={club.id} />
          <div className="club-logo-edit-row">
            <ClubCrest logoUrl={club.logoUrl} clubName={club.name} size="small" />
            <label>{t.logo}<input name="clubLogo" type="file" accept="image/*" /></label>
          </div>
          <label>{t.name}<input name="name" defaultValue={club.name} required /></label>
          <label>{t.city}<input name="city" defaultValue={club.city ?? ""} /></label>
          <label>{t.province}<input name="province" defaultValue={club.province ?? ""} /></label>
          <label>{t.postalCode}<input name="postalCode" defaultValue={club.postalCode ?? ""} /></label>
          <label>{t.availableCourts}<input name="availableCourts" type="number" min="0" defaultValue={club.availableCourts} /></label>
          <label className="check-line"><input name="managesCourtBookings" type="checkbox" defaultChecked={club.managesCourtBookings} /> {t.manageCourtBookingsWithApp}</label>
          <label>{t.address}<input name="address" defaultValue={club.address ?? ""} /></label>
          <label>{t.clubPhone}<input name="phone" type="tel" defaultValue={club.phone ?? ""} /></label>
          <label>{t.website}<input name="websiteUrl" type="url" defaultValue={club.websiteUrl ?? ""} /></label>
          <label>{t.closedDays}<textarea name="closedDays" defaultValue={club.closedDays.map((day) => day.closedOn.toISOString().slice(0, 10)).join("\n")} placeholder="2026-01-01" /></label>
          <label className="check-line"><input name="showContactPublic" type="checkbox" defaultChecked={club.showContactPublic} /> {t.showClubContactPublic}</label>
          <label>{t.assignedManager}
            <select name="managerUserId" defaultValue={club.managerUserId ?? ""} disabled={!isAdmin}>
              <option value="">{t.noManager}</option>
              {managers.map((manager) => (
                manager ? <option key={manager.id} value={manager.id}>{formatUserManagerName(manager)}</option> : null
              ))}
            </select>
          </label>
          <label>{t.federation}
            <select name="federationId" defaultValue={club.federationId ?? ""} disabled={!isAdmin}>
              <option value="">{t.noFederation}</option>
              {federations.map((federation) => (
                <option key={federation.id} value={federation.id}>
                  {federation.name} ({federation.code})
                </option>
              ))}
            </select>
          </label>
          <button type="submit">{t.save}</button>
        </form>
        <section className="list-panel">
          <h2>{t.clubPlayers}</h2>
          {club.memberships.map((membership) => (
            <article className="row-card club-player-row" key={membership.id}>
              <div>
                <strong>{membership.player.lastName}, {membership.player.firstName}</strong>
                <span>{membership.player.user?.email ?? t.noUser}</span>
              </div>
              <form action={removePlayerFromClubAction}>
                <input type="hidden" name="membershipId" value={membership.id} />
                <input type="hidden" name="clubId" value={club.id} />
                <button className="danger-button" type="submit">{t.removeFromClub}</button>
              </form>
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}
