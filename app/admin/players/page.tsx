import Link from "next/link";
import { savePlayerAction, updateUserOperationalRoleAction, updateUserSuspensionAction } from "@/app/admin/actions";
import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

function playerInitial(lastName: string) {
  const firstSurname = lastName.trim().split(/\s+/)[0] ?? "";
  const normalized = firstSurname.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const initial = normalized.charAt(0).toLocaleUpperCase("ca");
  return /^[A-Z]$/.test(initial) ? initial : "#";
}

function PlayerListThumbnail({
  player
}: {
  player: { firstName: string; lastName: string; gender: string; profilePhotoUrl: string | null; genericProfileVariant: string };
}) {
  if (player.profilePhotoUrl) {
    return <img className="player-list-thumbnail" src={player.profilePhotoUrl} alt={`${player.firstName} ${player.lastName}`} />;
  }

  const variant = player.gender === "male" || player.gender === "female"
    ? player.gender
    : player.genericProfileVariant;

  return (
    <div className={`player-list-thumbnail player-list-avatar ${variant}`} aria-label={`${player.firstName} ${player.lastName}`} role="img">
      <span className="avatar-head" />
      <span className="avatar-shoulders" />
    </div>
  );
}

export default async function PlayersPage() {
  const [players, clubs, currentUser, dictionary] = await Promise.all([
    prisma.player.findMany({
      where: { mergedIntoPlayerId: null },
      include: {
        user: { include: { roles: true } },
        memberships: {
          where: { toDate: null },
          include: { club: true },
          orderBy: { fromDate: "desc" },
          take: 1
        }
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
    }),
    prisma.club.findMany({ orderBy: [{ province: "asc" }, { name: "asc" }] }),
    getCurrentUser(),
    getDictionary()
  ]);
  const { t } = dictionary;
  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));
  const ownPlayerId = players.find((player) => player.userId === currentUser?.id)?.id;
  const canCreateOwnProfile = Boolean(currentUser && !ownPlayerId);
  const groupedPlayers = players.reduce<Array<{ initial: string; players: typeof players }>>((groups, player) => {
    const initial = playerInitial(player.lastName);
    const group = groups.find((item) => item.initial === initial);
    if (group) group.players.push(player);
    else groups.push({ initial, players: [player] });
    return groups;
  }, []);

  return (
    <main className="app-shell">
      <Navigation />
      <section className="page-heading">
        <p className="eyebrow">{t.admin}</p>
        <h1>{t.players}</h1>
        <p className="muted">{t.playerProfileIntro}</p>
        {isAdmin ? <Link className="secondary-link" href="/admin/players/duplicates">{t.duplicateManagement}</Link> : null}
      </section>

      {isAdmin || canCreateOwnProfile ? (
        <section className="centered-list player-form-section">
          <form className="admin-form" action={savePlayerAction}>
            <h2>{isAdmin ? t.newProfile : t.createMyProfile}</h2>
            <PlayerFields clubs={clubs} currentUserEmail={currentUser?.email} isAdmin={isAdmin} labels={t} />
            <button type="submit">{t.createPlayer}</button>
          </form>
        </section>
      ) : null}

      <section className="player-directory">
        <nav className="letter-jump-nav" aria-label={t.players}>
          {groupedPlayers.map((group) => (
            <a href={`#players-${group.initial}`} key={group.initial}>{group.initial}</a>
          ))}
        </nav>
        <div className="player-groups-grid">
          {groupedPlayers.map((group) => (
            <section className="player-letter-group" id={`players-${group.initial}`} key={group.initial}>
              <h2>{group.initial}</h2>
              <div className="player-letter-list">
                {group.players.map((player) => {
                  const clubName = player.memberships[0]?.clubNameAtThatTime ?? t.independent;
                  const playerUserRole = player.user?.roles.some((role) => role.role === "manager_fed")
                    ? "manager_fed"
                    : player.user?.roles.some((role) => role.role === "manager")
                    ? "manager"
                    : "player";
                  const isSuspended = Boolean(player.user?.suspendedAt);

                  return isAdmin || player.id === ownPlayerId ? (
                    <article className={`row-card player-list-row${isSuspended ? " is-suspended" : ""}`} key={player.id}>
                      <div className="player-list-main">
                        <PlayerListThumbnail player={player} />
                        <div className="player-list-text">
                          <strong><Link href={`/players/${player.id}`}>{player.lastName}, {player.firstName}</Link></strong>
                          <span>
                            {clubName}{player.user ? ` · ${playerUserRole === "manager_fed" ? t.federationManager : playerUserRole === "manager" ? t.manager : t.player}` : ""}
                            {isSuspended ? ` · ${t.suspendedAccount}` : ""}
                          </span>
                        </div>
                      </div>
                      <div className="row-actions">
                        {isAdmin && player.user ? (
                          <>
                            <form action={updateUserOperationalRoleAction} className="role-switch-form">
                              <input type="hidden" name="userId" value={player.user.id} />
                              <label>
                                <span>{t.activeRole}</span>
                                <select name="role" defaultValue={playerUserRole} disabled={isSuspended}>
                                  <option value="player">{t.player}</option>
                                  <option value="manager">{t.manager}</option>
                                  <option value="manager_fed">{t.federationManager}</option>
                                </select>
                              </label>
                              <button type="submit" disabled={isSuspended}>{t.save}</button>
                            </form>
                            <form action={updateUserSuspensionAction} className="account-suspension-form">
                              <input type="hidden" name="userId" value={player.user.id} />
                              <input type="hidden" name="action" value={isSuspended ? "reactivate" : "suspend"} />
                              {!isSuspended ? (
                                <input aria-label={t.suspensionReason} name="reason" placeholder={t.suspensionReason} />
                              ) : null}
                              <button
                                className={isSuspended ? "secondary-button" : "danger-button"}
                                disabled={player.user.id === currentUser?.id}
                                type="submit"
                              >
                                {isSuspended ? t.reactivateAccount : t.suspendAccount}
                              </button>
                            </form>
                          </>
                        ) : null}
                        <Link className="secondary-link" href={`/players/${player.id}/edit`}>{t.edit}</Link>
                      </div>
                    </article>
                  ) : (
                    <article className="row-card simple-row player-list-row" key={player.id}>
                      <div className="player-list-main">
                        <PlayerListThumbnail player={player} />
                        <div className="player-list-text">
                          <strong><Link href={`/players/${player.id}`}>{player.lastName}, {player.firstName}</Link></strong>
                          <span>{clubName}</span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </section>

    </main>
  );
}

type PlayerFieldData = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string | null;
  emailVerified?: boolean;
  preferredLocale?: string;
  gender?: string;
  dominantHand?: string;
  heightCm?: number | null;
  weightKg?: unknown;
  racketBrand?: string | null;
  profilePhotoUrl?: string | null;
  clubId?: string;
  showContactPublic?: boolean;
  showPhysicalPublic?: boolean;
  receivesMatchCommunications?: boolean;
};

function PlayerFields({
  clubs,
  currentUserEmail,
  isAdmin,
  labels,
  player
}: {
  clubs: Array<{ id: string; name: string }>;
  currentUserEmail?: string;
  isAdmin: boolean;
  labels: Record<string, string>;
  player?: PlayerFieldData;
}) {
  return (
    <>
      <div className="form-row">
        <label>{labels.firstName}<input name="firstName" defaultValue={player?.firstName ?? ""} required /></label>
        <label>{labels.lastName}<input name="lastName" defaultValue={player?.lastName ?? ""} required /></label>
      </div>
      <input type="hidden" name="profilePhotoUrl" value={player?.profilePhotoUrl ?? ""} />
      <label>{labels.photo}<input name="profilePhoto" type="file" accept="image/*" /></label>
      <div className="form-row">
        <label>{labels.email}<input name="email" type="email" defaultValue={player?.email ?? currentUserEmail ?? ""} readOnly={!isAdmin} required={!isAdmin} /></label>
        <label>{labels.phone}<input name="phone" defaultValue={player?.phone ?? ""} /></label>
      </div>
      <div className="form-row">
        <label>{labels.preferredLocale}
          <select name="preferredLocale" defaultValue={player?.preferredLocale ?? "es"}>
            <option value="ca">{labels.catalan}</option>
            <option value="es">{labels.spanish}</option>
            <option value="en">{labels.english}</option>
          </select>
        </label>
        <label>{labels.club}
          <select name="clubId" defaultValue={player?.clubId ?? ""} disabled={!isAdmin}>
            <option value="">{labels.noClub}</option>
            {clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
          </select>
        </label>
      </div>
      <label className="check-line">
        <input name="emailVerified" type="checkbox" defaultChecked={player?.emailVerified ?? false} disabled={!isAdmin} />
        {labels.emailVerified}
      </label>
      <label className="check-line">
        <input name="showContactPublic" type="checkbox" defaultChecked={player?.showContactPublic ?? true} />
        {labels.showContactPublic}
      </label>
      <label className="check-line">
        <input name="showPhysicalPublic" type="checkbox" defaultChecked={player?.showPhysicalPublic ?? true} />
        {labels.showPhysicalPublic}
      </label>
      <label className="check-line">
        <input name="receivesMatchCommunications" type="checkbox" defaultChecked={player?.receivesMatchCommunications ?? false} />
        {labels.receiveMatchCommunications}
      </label>
      <div className="form-row">
        <label>{labels.gender}
          <select name="gender" defaultValue={player?.gender ?? "not_specified"}>
            <option value="male">{labels.male}</option>
            <option value="female">{labels.female}</option>
            <option value="other">{labels.other}</option>
            <option value="not_specified">{labels.not_specified}</option>
          </select>
        </label>
        <label>{labels.dominantHand}
          <select name="dominantHand" defaultValue={player?.dominantHand ?? "not_specified"}>
            <option value="right">{labels.right}</option>
            <option value="left">{labels.left}</option>
            <option value="ambidextrous">{labels.ambidextrous}</option>
            <option value="not_specified">{labels.not_specified}</option>
          </select>
        </label>
      </div>
      <div className="form-row">
        <label>{labels.heightCm}<input name="heightCm" type="number" defaultValue={player?.heightCm ?? ""} /></label>
        <label>{labels.weightKg}<input name="weightKg" type="number" step="0.1" defaultValue={String(player?.weightKg ?? "")} /></label>
      </div>
      <label>{labels.racketBrand}<input name="racketBrand" defaultValue={player?.racketBrand ?? ""} /></label>
    </>
  );
}
