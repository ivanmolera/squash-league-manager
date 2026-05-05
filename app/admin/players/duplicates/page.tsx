import Link from "next/link";
import { mergePlayerProfilesAction, reviewPlayerLinkRequestAction } from "@/app/admin/actions";
import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { getDictionary } from "@/src/lib/i18n";
import { findPotentialDuplicatePlayers, formatPlayerIdentityName } from "@/src/lib/player-identity";
import { prisma } from "@/src/lib/prisma";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

function currentClub(player: { memberships: Array<{ clubNameAtThatTime: string; club?: { name: string } | null }> }) {
  return player.memberships[0]?.club?.name ?? player.memberships[0]?.clubNameAtThatTime ?? null;
}

export default async function PlayerDuplicatesPage() {
  const [currentUser, dictionary] = await Promise.all([getCurrentUser(), getDictionary()]);
  const { t } = dictionary;
  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));
  if (!isAdmin) notFound();

  const [pendingRequests, duplicateCandidates, players] = await Promise.all([
    prisma.playerLinkRequest.findMany({
      where: { status: "pending" },
      include: {
        user: true,
        candidatePlayer: {
          include: {
            user: true,
            memberships: {
              orderBy: { fromDate: "desc" },
              take: 1,
              include: { club: { select: { name: true } } }
            }
          }
        }
      },
      orderBy: [{ matchScore: "desc" }, { createdAt: "asc" }]
    }),
    findPotentialDuplicatePlayers(86),
    prisma.player.findMany({
      where: { mergedIntoPlayerId: null },
      select: { id: true, firstName: true, lastName: true, userId: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
    })
  ]);

  return (
    <main className="app-shell">
      <Navigation />
      <section className="page-heading">
        <p className="eyebrow">{t.admin}</p>
        <h1>{t.duplicateManagement}</h1>
        <p className="muted">{t.duplicateManagementIntro}</p>
      </section>

      <section className="centered-list">
        <h2>{t.pendingProfileLinks}</h2>
        {pendingRequests.length ? pendingRequests.map((request) => (
          <article className="row-card" key={request.id}>
            <div>
              <p className="eyebrow">{t.matchScore}: {request.matchScore}</p>
              <h3>{request.requestedLastName}, {request.requestedFirstName}</h3>
              <p className="muted">{t.requestedAccount}: {request.requestedEmail}</p>
              <p>
                {t.existingPlayerProfile}:{" "}
                <Link href={`/players/${request.candidatePlayerId}`}>
                  {formatPlayerIdentityName(request.candidatePlayer)}
                </Link>
                {currentClub(request.candidatePlayer) ? ` · ${currentClub(request.candidatePlayer)}` : ""}
              </p>
              {Array.isArray(request.matchReasons) && request.matchReasons.length ? (
                <p className="muted">{t.matchReasons}: {request.matchReasons.map(String).join(", ")}</p>
              ) : null}
            </div>
            <div className="row-actions">
              <form action={reviewPlayerLinkRequestAction}>
                <input type="hidden" name="requestId" value={request.id} />
                <input type="hidden" name="action" value="approve" />
                <button type="submit">{t.approveLink}</button>
              </form>
              <form action={reviewPlayerLinkRequestAction}>
                <input type="hidden" name="requestId" value={request.id} />
                <input type="hidden" name="action" value="reject" />
                <button className="secondary-button" type="submit">{t.rejectLink}</button>
              </form>
            </div>
          </article>
        )) : <p className="muted">{t.noPendingRequests}</p>}
      </section>

      <section className="centered-list">
        <h2>{t.potentialDuplicates}</h2>
        {duplicateCandidates.length ? duplicateCandidates.map((candidate) => (
          <article className="row-card" key={`${candidate.primary.id}-${candidate.duplicate.id}`}>
            <div>
              <p className="eyebrow">{t.matchScore}: {candidate.score}</p>
              <h3>
                <Link href={`/players/${candidate.primary.id}`}>{formatPlayerIdentityName(candidate.primary)}</Link>
                {" · "}
                <Link href={`/players/${candidate.duplicate.id}`}>{formatPlayerIdentityName(candidate.duplicate)}</Link>
              </h3>
              <p className="muted">{t.matchReasons}: {candidate.reasons.join(", ")}</p>
            </div>
            <div className="row-actions">
              <form action={mergePlayerProfilesAction}>
                <input type="hidden" name="primaryPlayerId" value={candidate.primary.id} />
                <input type="hidden" name="duplicatePlayerId" value={candidate.duplicate.id} />
                <button type="submit">{t.mergeIntoLeft}</button>
              </form>
              <form action={mergePlayerProfilesAction}>
                <input type="hidden" name="primaryPlayerId" value={candidate.duplicate.id} />
                <input type="hidden" name="duplicatePlayerId" value={candidate.primary.id} />
                <button className="secondary-button" type="submit">{t.mergeIntoRight}</button>
              </form>
            </div>
          </article>
        )) : <p className="muted">{t.noDuplicateCandidates}</p>}
      </section>

      <section className="centered-list">
        <form className="admin-form" action={mergePlayerProfilesAction}>
          <h2>{t.manualMerge}</h2>
          <label>{t.primaryProfile}
            <select name="primaryPlayerId" required>
              <option value="">{t.selectPlayer}</option>
              {players.map((player) => (
                <option key={player.id} value={player.id}>
                  {formatPlayerIdentityName(player)}{player.userId ? " · user" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>{t.duplicateProfile}
            <select name="duplicatePlayerId" required>
              <option value="">{t.selectPlayer}</option>
              {players.map((player) => (
                <option key={player.id} value={player.id}>
                  {formatPlayerIdentityName(player)}{player.userId ? " · user" : ""}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">{t.mergeProfiles}</button>
        </form>
      </section>
    </main>
  );
}
