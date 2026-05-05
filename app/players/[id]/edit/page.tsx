import { notFound, redirect } from "next/navigation";
import { changePlayerPasswordAction, requestJoinClubAction, savePlayerAction } from "@/app/admin/actions";
import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { getFeatureSettings } from "@/src/lib/features";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";
import { SaveConfirmation } from "./save-confirmation";

export const dynamic = "force-dynamic";

export default async function EditPlayerPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ saved?: string; joinRequested?: string; joinEmailFailed?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const [player, currentUser, dictionary, features, currentSeason, clubs] = await Promise.all([
    prisma.player.findUnique({
      where: { id },
      include: {
        user: true,
        memberships: {
          include: { club: true, season: true },
          orderBy: [{ season: { startsAt: "desc" } }, { fromDate: "desc" }]
        },
        joinRequests: {
          where: { status: "pending" },
          include: { club: true, season: true },
          orderBy: { requestedAt: "desc" }
        }
      }
    }),
    getCurrentUser(),
    getDictionary(),
    getFeatureSettings(),
    prisma.season.findFirst({ where: { status: "active" }, orderBy: { startsAt: "desc" } }),
    prisma.club.findMany({ include: { manager: true }, orderBy: [{ province: "asc" }, { name: "asc" }] })
  ]);
  const { t } = dictionary;
  if (!player) notFound();
  if (player.mergedIntoPlayerId) redirect(`/players/${player.mergedIntoPlayerId}/edit`);
  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));
  if (!isAdmin && player.userId !== currentUser?.id) notFound();
  const isOwnProfile = player.userId === currentUser?.id;
  const currentMembership = currentSeason
    ? player.memberships.find((membership) => membership.seasonId === currentSeason.id)
    : null;
  const pendingJoinRequest = currentSeason
    ? player.joinRequests.find((request) => request.seasonId === currentSeason.id)
    : player.joinRequests[0] ?? null;
  const requestableClubs = clubs.filter((club) => club.id !== currentMembership?.clubId);

  return (
    <main className="app-shell">
      <Navigation />
      <section className="edit-stack">
        <form className="admin-form" action={savePlayerAction}>
          <h1>{t.myProfile}</h1>
          {query?.saved === "1" ? <SaveConfirmation message={t.savedChanges} /> : null}
          {query?.joinRequested === "1" ? <SaveConfirmation message={t.clubJoinRequestSent} /> : null}
          {query?.joinEmailFailed === "1" ? <p className="warning-box">{t.clubJoinRequestEmailFailed}</p> : null}
          <input type="hidden" name="playerId" value={player.id} />
          <input type="hidden" name="profilePhotoUrl" value={player.profilePhotoUrl ?? ""} />
          <label>{t.firstName}<input name="firstName" defaultValue={player.firstName} required /></label>
          <label>{t.lastName}<input name="lastName" defaultValue={player.lastName} required /></label>
          <label>{t.photo}<input name="profilePhoto" type="file" accept="image/*" /></label>
          <label>{t.email}<input name="email" type="email" defaultValue={player.user?.email ?? ""} readOnly={!isAdmin} required={!isAdmin} /></label>
          <label>{t.phone}<input name="phone" defaultValue={player.user?.phone ?? ""} /></label>
          <label>{t.preferredLocale}
            <select name="preferredLocale" defaultValue={player.user?.preferredLocale ?? "es"}>
              <option value="ca">{t.catalan}</option><option value="es">{t.spanish}</option><option value="en">{t.english}</option>
            </select>
          </label>
          <label>{t.gender}
            <select name="gender" defaultValue={player.gender}>
              <option value="male">{t.male}</option><option value="female">{t.female}</option><option value="other">{t.other}</option><option value="not_specified">{t.not_specified}</option>
            </select>
          </label>
          <label>{t.dominantHand}
            <select name="dominantHand" defaultValue={player.dominantHand}>
              <option value="right">{t.right}</option><option value="left">{t.left}</option><option value="ambidextrous">{t.ambidextrous}</option><option value="not_specified">{t.not_specified}</option>
            </select>
          </label>
          <label>{t.height}<input name="heightCm" type="number" defaultValue={player.heightCm ?? ""} /></label>
          <label>{t.weight}<input name="weightKg" type="number" step="0.1" defaultValue={String(player.weightKg ?? "")} /></label>
          <label>{t.racket}<input name="racketBrand" defaultValue={player.racketBrand ?? ""} /></label>
          <label className="check-line"><input name="showContactPublic" type="checkbox" defaultChecked={player.showContactPublic} /> {t.showContactPublic}</label>
          <label className="check-line"><input name="showPhysicalPublic" type="checkbox" defaultChecked={player.showPhysicalPublic} /> {t.showPhysicalPublic}</label>
          {features.player_communications ? (
            <label className="check-line"><input name="receivesMatchCommunications" type="checkbox" defaultChecked={player.receivesMatchCommunications} /> {t.receiveMatchCommunications}</label>
          ) : null}
          {isAdmin ? <label className="check-line"><input name="emailVerified" type="checkbox" defaultChecked={player.user?.emailVerified ?? false} /> {t.emailVerified}</label> : null}
          <button type="submit">{t.save}</button>
        </form>
        {player.userId ? (
          <form className="admin-form" action={changePlayerPasswordAction}>
            <h2>{t.changePassword}</h2>
            <input type="hidden" name="playerId" value={player.id} />
            {!isAdmin ? <label>{t.currentPassword}<input name="currentPassword" type="password" autoComplete="current-password" required /></label> : null}
            <label>{t.newPassword}<input name="newPassword" type="password" autoComplete="new-password" minLength={8} required /></label>
            <label>{t.repeatNewPassword}<input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required /></label>
            <button type="submit">{isAdmin ? t.updatePassword : t.changePassword}</button>
          </form>
        ) : null}
        {isOwnProfile ? (
          <form className="admin-form" action={requestJoinClubAction}>
            <h2>{t.requestJoinClub}</h2>
            <input type="hidden" name="playerId" value={player.id} />
            {currentMembership ? (
              <p className="muted">{t.alreadyBelongsToClub}: {currentMembership.club.name} · {currentMembership.season.name}</p>
            ) : pendingJoinRequest ? (
              <p className="warning-box">{t.pendingClubJoinRequest}: {pendingJoinRequest.club.name}</p>
            ) : requestableClubs.length ? (
              <>
                <label>{t.club}
                  <select name="clubId" required>
                    <option value="">{t.selectClub}</option>
                    {requestableClubs.map((club) => (
                      <option key={club.id} value={club.id}>
                        {club.name}{club.manager?.email ? "" : ` · ${t.noManager}`}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit">{t.sendClubJoinRequest}</button>
              </>
            ) : (
              <p className="muted">{t.noClubsAvailableForJoinRequest}</p>
            )}
          </form>
        ) : null}
      </section>
    </main>
  );
}
