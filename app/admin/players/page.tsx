import Link from "next/link";
import { updateUserOperationalRoleAction, updateUserSuspensionAction } from "@/app/admin/actions";
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
  const [players, currentUser, dictionary] = await Promise.all([
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
        <div className="heading-actions">
          {isAdmin ? <Link className="primary-link" href="/admin/players/new">{t.createNewProfile}</Link> : null}
          {!isAdmin && canCreateOwnProfile ? <Link className="primary-link" href="/players/me">{t.createNewProfile}</Link> : null}
          {isAdmin ? <Link className="secondary-link" href="/admin/players/duplicates">{t.duplicateManagement}</Link> : null}
        </div>
      </section>

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
