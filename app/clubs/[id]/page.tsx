import Link from "next/link";
import { notFound } from "next/navigation";
import {
  acceptMatchProposalAction,
  cancelCourtReservationAction,
  cancelMatchProposalAction,
  completeMatchProposalAction,
  proposeMatchAction,
  reserveCourtAction,
  reviewClubJoinRequestAction
} from "@/app/admin/actions";
import { Navigation } from "@/app/navigation";
import { ClubCrest } from "@/src/components/club-crest";
import { RankingCodeBadge } from "@/src/components/ranking-code-picker";
import { autonomousCommunityForLocation } from "@/src/lib/autonomous-communities";
import { getCurrentUser } from "@/src/lib/auth";
import {
  addDaysToCourtDateKey,
  courtDateKey,
  courtLocalDateTimeToUtc,
  courtWeekStart,
  formatCourtBookingDay,
  formatCourtBookingTime
} from "@/src/lib/court-booking-time";
import { getFeatureSettings } from "@/src/lib/features";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

type ClubMembership = NonNullable<Awaited<ReturnType<typeof getClub>>>["memberships"][number];

async function getClub(id: string) {
  return prisma.club.findUnique({
    where: { id },
    include: {
      manager: true,
      teams: {
        include: { rosters: { include: { player: true }, orderBy: [{ rosterOrder: "asc" }, { playerNameAtThatTime: "asc" }] } },
        orderBy: [{ name: "asc" }]
      },
      memberships: {
        include: { player: true, season: true },
        orderBy: [
          { season: { startsAt: "desc" } },
          { player: { lastName: "asc" } },
          { player: { firstName: "asc" } }
        ]
      },
      joinRequests: {
        where: { status: "pending" },
        include: {
          player: { include: { user: true } },
          season: true
        },
        orderBy: [{ requestedAt: "asc" }]
      },
      closedDays: true
    }
  });
}

function weekStart(date = new Date()) {
  return courtWeekStart(date);
}

function addDays(date: Date, days: number) {
  return courtLocalDateTimeToUtc(addDaysToCourtDateKey(courtDateKey(date), days));
}

function slotDate(day: Date, hour: number, minute: number) {
  return courtLocalDateTimeToUtc(courtDateKey(day), hour, minute);
}

function formatDay(date: Date, locale: string) {
  return formatCourtBookingDay(date, locale);
}

function dateKey(date: Date) {
  return courtDateKey(date);
}

function dateFromKey(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = courtLocalDateTimeToUtc(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function clampDate(date: Date, start: Date, endExclusive: Date) {
  if (date < start) return start;
  if (date >= endExclusive) return addDays(endExclusive, -1);
  return date;
}

function formatTime(date: Date) {
  return formatCourtBookingTime(date);
}

function isSlotOverlapping(reservation: { startsAt: Date; endsAt: Date }, startsAt: Date) {
  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
  return reservation.startsAt < endsAt && reservation.endsAt > startsAt;
}

function playerName(player: { firstName: string; lastName: string }) {
  return `${player.firstName} ${player.lastName}`;
}

function groupMembershipsBySeason(memberships: ClubMembership[]) {
  return memberships.reduce<Array<{ seasonId: string; seasonName: string; startsAt: Date | null; memberships: ClubMembership[] }>>((groups, membership) => {
    const group = groups.find((item) => item.seasonId === membership.seasonId);
    if (group) {
      group.memberships.push(membership);
    } else {
      groups.push({
        seasonId: membership.seasonId,
        seasonName: membership.season.name,
        startsAt: membership.season.startsAt,
        memberships: [membership]
      });
    }
    return groups;
  }, []);
}

function clubMapUrl(club: { name: string; address: string | null; postalCode: string | null; city: string | null; province: string | null }) {
  const query = [club.address, club.postalCode, club.city, club.province, club.name].filter(Boolean).join(", ");
  return query ? `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed` : null;
}

function websiteHref(value: string) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function websiteLabel(value: string) {
  try {
    return new URL(websiteHref(value)).hostname.replace(/^www\./i, "");
  } catch {
    return value.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
  }
}

export default async function ClubDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ bookingDate?: string; joinReviewed?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const [club, currentUser, features] = await Promise.all([
    getClub(id),
    getCurrentUser(),
    getFeatureSettings()
  ]);
  const { locale, t } = await getDictionary();

  if (!club) notFound();

  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));
  const canEdit = isAdmin || club.managerUserId === currentUser?.id;
  const canSeeContact = canEdit || club.showContactPublic;
  const membershipsBySeason = groupMembershipsBySeason(club.memberships);
  const mapUrl = features.club_maps && canSeeContact ? clubMapUrl(club) : null;
  const community = autonomousCommunityForLocation(club);
  const showBookings = features.court_bookings && club.managesCourtBookings && club.availableCourts > 0;
  const currentPlayer = currentUser
    ? await prisma.player.findUnique({
        where: { userId: currentUser.id },
        include: {
          memberships: {
            where: { toDate: null },
            select: { clubId: true }
          }
        }
      })
    : null;
  const canUseClubCourts = club.publicCourtAccess || Boolean(currentPlayer?.memberships.some((membership) => membership.clubId === club.id));
  const bookingStart = weekStart();
  const bookingEnd = addDays(bookingStart, 14);
  const requestedBookingDate = dateFromKey(query?.bookingDate);
  const selectedBookingDate = courtLocalDateTimeToUtc(dateKey(clampDate(requestedBookingDate ?? new Date(), bookingStart, bookingEnd)));
  const selectedBookingDateEnd = addDays(selectedBookingDate, 1);
  const selectedBookingDateKey = dateKey(selectedBookingDate);
  const previousBookingDate = selectedBookingDate > bookingStart ? dateKey(addDays(selectedBookingDate, -1)) : null;
  const nextBookingDate = addDays(selectedBookingDate, 1) < bookingEnd ? dateKey(addDays(selectedBookingDate, 1)) : null;
  const reservations = showBookings
    ? await prisma.courtReservation.findMany({
          where: {
            clubId: club.id,
            status: "active",
            startsAt: { gte: bookingStart, lt: bookingEnd }
          },
          include: {
            user: true,
            player: true,
            partnerPlayer: true,
            matchProposal: {
              include: {
                proposerPlayer: true,
                acceptorPlayer: true,
                winnerPlayer: true
              }
            }
          },
          orderBy: [{ startsAt: "asc" }, { courtNumber: "asc" }]
        })
    : [];
  const closedDayKeys = new Set(club.closedDays.map((day) => day.closedOn.toISOString().slice(0, 10)));
  const activeFutureReservation = currentUser
    ? reservations.find((reservation) => reservation.userId === currentUser.id && reservation.startsAt >= new Date())
    : null;
  const selectedDayReservations = reservations.filter((reservation) =>
    reservation.startsAt >= selectedBookingDate && reservation.startsAt < selectedBookingDateEnd
  );
  const matchProposals = showBookings
    ? await prisma.matchProposal.findMany({
        where: {
          clubId: club.id,
          status: { in: ["open", "accepted"] },
          courtReservation: {
            status: "active",
            startsAt: { gte: new Date(), lt: bookingEnd }
          }
        },
        include: {
          courtReservation: true,
          proposerPlayer: true,
          acceptorPlayer: true
        },
        orderBy: [{ courtReservation: { startsAt: "asc" } }]
      })
    : [];
  const slots = Array.from({ length: 13 }, (_, index) => ({
    hour: 8 + index,
    minute: 0
  }));

  return (
    <main className="app-shell">
      <Navigation />
      <section className="detail-header">
        <div className="detail-title-with-crest">
          <ClubCrest logoUrl={club.logoUrl} clubName={club.name} size="large" />
          <div>
            <p className="eyebrow">{t.club}</p>
            <h1>{club.name}</h1>
          </div>
        </div>
        {canEdit ? <Link className="primary-link" href={`/clubs/${club.id}/edit`}>{t.edit}</Link> : null}
      </section>
      <section className="detail-grid">
        {query?.joinReviewed === "1" ? (
          <p className="success-message full-width" role="status">{t.clubJoinRequestReviewed}</p>
        ) : null}
        <article className="list-panel club-detail-panel full-width">
          <h2>{t.clubDetails}</h2>
          <div className={mapUrl ? "club-detail-content has-map" : "club-detail-content"}>
            <div className="club-detail-data">
              {community ? <div className="club-detail-community-flag"><RankingCodeBadge code={community.code} /></div> : null}
              <div className="club-location-lines">
                <p>{club.city ?? t.notProvidedFemale}</p>
                <p>{canSeeContact ? club.address ?? t.notProvidedFemale : t.privateFemaleValue}</p>
                <p>
                  {club.postalCode ?? t.notProvided}
                  {club.province ? ` (${club.province})` : ""}
                </p>
              </div>
              <p>
                <strong>{t.website}:</strong>{" "}
                {canSeeContact
                  ? club.websiteUrl
                    ? <a href={websiteHref(club.websiteUrl)} rel="noreferrer" target="_blank">{websiteLabel(club.websiteUrl)}</a>
                    : t.notProvidedFemale
                  : t.privateFemaleValue}
              </p>
              <p><strong>{t.clubPhone}:</strong> {canSeeContact ? club.phone ?? t.notProvided : t.privateValue}</p>
              <p><strong>{t.assignedManager}:</strong> {club.manager?.displayName ?? club.manager?.email ?? t.noManager}</p>
              <p><strong>{t.availableCourts}:</strong> {club.availableCourts}</p>
              <p><strong>{t.courtAccess}:</strong> {club.publicCourtAccess ? t.publicCourtAccess : t.membersOnlyCourtAccess}</p>
            </div>
            {mapUrl ? (
              <iframe
                className="club-map"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                src={mapUrl}
                title={`${club.name} · ${t.location}`}
              />
            ) : null}
          </div>
        </article>
        {showBookings ? (
          <article className="list-panel full-width" id="reservas">
            <h2>{t.courtBookings}</h2>
            {!currentUser ? <p className="warning-box">{t.signInToBookCourt}</p> : null}
            {currentUser && !canUseClubCourts ? <p className="warning-box">{t.membersOnlyBookingWarning}</p> : null}
            {currentPlayer && !currentPlayer.skillLevelConfirmed ? <p className="warning-box">{t.skillQuestionnaireCompetitiveWarning}</p> : null}
            {activeFutureReservation ? <p className="warning-box">{t.activeCourtReservationWarning}</p> : null}
            <div className="court-booking-toolbar">
              {previousBookingDate ? (
                <Link aria-label={t.previousDay} className="court-booking-arrow" href={`/clubs/${club.id}?bookingDate=${previousBookingDate}#reservas`}>‹</Link>
              ) : <span className="court-booking-arrow is-disabled">‹</span>}
              <div className="court-date-label">
                {formatDay(selectedBookingDate, locale)}
              </div>
              {nextBookingDate ? (
                <Link aria-label={t.nextDay} className="court-booking-arrow" href={`/clubs/${club.id}?bookingDate=${nextBookingDate}#reservas`}>›</Link>
              ) : <span className="court-booking-arrow is-disabled">›</span>}
            </div>
            <div className="court-booking-scroll">
              <table className="court-booking-table is-compact">
                <thead>
                  <tr>
                    <th>{t.time}</th>
                    {Array.from({ length: club.availableCourts }, (_, courtIndex) => (
                      <th key={courtIndex}>{t.court} {courtIndex + 1}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {slots.map((slot) => (
                    <tr key={`${slot.hour}:${slot.minute}`}>
                      <th>{`${String(slot.hour).padStart(2, "0")}:${String(slot.minute).padStart(2, "0")}`}</th>
                      {Array.from({ length: club.availableCourts }, (_, courtIndex) => {
                        const startsAt = slotDate(selectedBookingDate, slot.hour, slot.minute);
                        const reservation = selectedDayReservations.find((item) => item.courtNumber === courtIndex + 1 && isSlotOverlapping(item, startsAt));
                        const isPast = startsAt < new Date();
                        const isClosed = closedDayKeys.has(selectedBookingDateKey);
                        const canBook = currentUser && canUseClubCourts && !reservation && !isPast && !isClosed && !activeFutureReservation;
                        const proposal = reservation?.matchProposal;
                        const canAcceptProposal = proposal?.status === "open" && currentPlayer && canUseClubCourts && proposal.proposerPlayerId !== currentPlayer.id &&
                          (proposal.type !== "competitive" || (currentPlayer.skillLevelConfirmed && proposal.proposerPlayer.skillLevelConfirmed && Math.abs(Number(currentPlayer.skillLevel) - Number(proposal.proposerPlayer.skillLevel)) <= 2));
                        const canProposeCompetitive = currentPlayer?.skillLevelConfirmed;

                        return (
                          <td className={reservation ? "reserved-slot" : isClosed || isPast ? "unavailable-slot" : "available-slot"} key={`${selectedBookingDateKey}-${courtIndex}-${slot.hour}-${slot.minute}`}>
                            {reservation ? (
                              <div className="slot-reservation">
                                <strong>{proposal ? t.matchProposalReserved : t.reserved.toUpperCase()}</strong>
                                {proposal ? (
                                  <>
                                    <span>{proposal.type === "competitive" ? t.competitiveMatch : t.friendlyMatch}</span>
                                    <span>{playerName(proposal.proposerPlayer)}</span>
                                    {proposal.acceptorPlayer ? <span>{playerName(proposal.acceptorPlayer)}</span> : null}
                                    {canAcceptProposal ? (
                                      <form action={acceptMatchProposalAction}>
                                        <input type="hidden" name="proposalId" value={proposal.id} />
                                        <input type="hidden" name="clubId" value={club.id} />
                                        <button type="submit">{t.acceptMatchProposal}</button>
                                      </form>
                                    ) : null}
                                  </>
                                ) : null}
                                {(reservation.userId === currentUser?.id || canEdit) ? (
                                  <form action={proposal ? cancelMatchProposalAction : cancelCourtReservationAction}>
                                    {proposal ? (
                                      <input type="hidden" name="proposalId" value={proposal.id} />
                                    ) : (
                                      <input type="hidden" name="reservationId" value={reservation.id} />
                                    )}
                                    <input type="hidden" name="clubId" value={club.id} />
                                    <button type="submit">{t.releaseCourt}</button>
                                  </form>
                                ) : null}
                              </div>
                            ) : isClosed ? (
                              <span>{t.closed}</span>
                            ) : canBook ? (
                              <details className="slot-booking-details">
                                <summary>{formatTime(startsAt)}</summary>
                                <form className="slot-booking-form" action={reserveCourtAction}>
                                  <input type="hidden" name="clubId" value={club.id} />
                                  <input type="hidden" name="courtNumber" value={courtIndex + 1} />
                                  <input type="hidden" name="startsAt" value={startsAt.toISOString()} />
                                  <button type="submit">{t.bookCourt}</button>
                                </form>
                                {currentPlayer ? (
                                  <form className="slot-booking-form" action={proposeMatchAction}>
                                    <input type="hidden" name="clubId" value={club.id} />
                                    <input type="hidden" name="courtNumber" value={courtIndex + 1} />
                                    <input type="hidden" name="startsAt" value={startsAt.toISOString()} />
                                    <select name="type" defaultValue="friendly" aria-label={t.matchType}>
                                      <option value="friendly">{t.friendlyMatch}</option>
                                      {canProposeCompetitive ? <option value="competitive">{t.competitiveMatch}</option> : null}
                                    </select>
                                    <button type="submit">{t.proposeMatch}</button>
                                  </form>
                                ) : null}
                              </details>
                            ) : (
                              <span>{formatTime(startsAt)}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <section className="match-proposal-list">
              <h3>{t.matchProposals}</h3>
              {matchProposals.length ? matchProposals.map((proposal) => {
                const canAcceptProposal = proposal.status === "open" && currentPlayer && canUseClubCourts && proposal.proposerPlayerId !== currentPlayer.id &&
                  (proposal.type !== "competitive" || (currentPlayer.skillLevelConfirmed && Math.abs(Number(currentPlayer.skillLevel) - Number(proposal.proposerPlayer.skillLevel)) <= 2));
                const canManageProposal = canEdit || proposal.proposerUserId === currentUser?.id || proposal.acceptorUserId === currentUser?.id;
                return (
                  <article className="row-card match-proposal-row" key={proposal.id}>
                    <div>
                      <strong>{formatDay(proposal.courtReservation.startsAt, locale)} · {formatTime(proposal.courtReservation.startsAt)}</strong>
                      <span>{t.court} {proposal.courtReservation.courtNumber} · {proposal.type === "competitive" ? t.competitiveMatch : t.friendlyMatch}</span>
                      <span>{t.proposer}: {playerName(proposal.proposerPlayer)}</span>
                      <span>{proposal.acceptorPlayer ? `${t.acceptedBy}: ${playerName(proposal.acceptorPlayer)}` : t.openMatchProposal}</span>
                    </div>
                    {canAcceptProposal ? (
                      <form action={acceptMatchProposalAction}>
                        <input type="hidden" name="proposalId" value={proposal.id} />
                        <input type="hidden" name="clubId" value={club.id} />
                        <button type="submit">{t.acceptMatchProposal}</button>
                      </form>
                    ) : null}
                    {proposal.status === "accepted" && canManageProposal ? (
                      <form className="inline-form" action={completeMatchProposalAction}>
                        <input type="hidden" name="proposalId" value={proposal.id} />
                        <input type="hidden" name="clubId" value={club.id} />
                        <select name="winnerPlayerId" aria-label={t.winner}>
                          <option value={proposal.proposerPlayerId}>{playerName(proposal.proposerPlayer)}</option>
                          {proposal.acceptorPlayerId && proposal.acceptorPlayer ? (
                            <option value={proposal.acceptorPlayerId}>{playerName(proposal.acceptorPlayer)}</option>
                          ) : null}
                        </select>
                        <input name="scoreSummary" placeholder={t.result} />
                        <button type="submit">{t.completeMatch}</button>
                      </form>
                    ) : null}
                    {canManageProposal ? (
                      <form action={cancelMatchProposalAction}>
                        <input type="hidden" name="proposalId" value={proposal.id} />
                        <input type="hidden" name="clubId" value={club.id} />
                        <button type="submit">{t.cancelMatchProposal}</button>
                      </form>
                    ) : null}
                  </article>
                );
              }) : <p className="muted">{t.noMatchProposals}</p>}
            </section>
          </article>
        ) : null}
        {features.court_bookings && canEdit && !showBookings ? (
          <article className="list-panel full-width">
            <h2>{t.courtBookings}</h2>
            <p className="warning-box">
              {club.availableCourts > 0 ? t.courtBookingsDisabledHint : t.courtBookingsNoCourtsHint}
            </p>
            <Link className="secondary-link" href={`/clubs/${club.id}/edit`}>{t.editClub}</Link>
          </article>
        ) : null}
        {canEdit ? (
          <article className="list-panel full-width">
            <h2>{t.clubJoinRequests}</h2>
            {club.joinRequests.length ? club.joinRequests.map((request) => (
              <div className="row-card" key={request.id}>
                <div>
                  <strong>
                    <Link href={`/players/${request.playerId}`}>{request.player.lastName}, {request.player.firstName}</Link>
                  </strong>
                  <p className="muted">
                    {request.player.user?.email ?? t.noUser}
                    {request.season ? ` · ${request.season.name}` : ""}
                  </p>
                </div>
                <div className="row-actions">
                  <form action={reviewClubJoinRequestAction}>
                    <input type="hidden" name="requestId" value={request.id} />
                    <input type="hidden" name="action" value="accept" />
                    <button type="submit">{t.accept}</button>
                  </form>
                  <form action={reviewClubJoinRequestAction}>
                    <input type="hidden" name="requestId" value={request.id} />
                    <input type="hidden" name="action" value="reject" />
                    <button className="secondary-button" type="submit">{t.reject}</button>
                  </form>
                </div>
              </div>
            )) : <p className="muted">{t.noClubJoinRequests}</p>}
          </article>
        ) : null}
        <article className="list-panel club-teams-panel">
          <h2>{t.teams}</h2>
          {club.teams.map((team) => (
            <p key={team.id}>
              <Link href={`/teams/${team.id}`}>{team.name}</Link> · {team.rosters.length} {t.players.toLowerCase()}
            </p>
          ))}
        </article>
        <article className="list-panel">
          <h2>{t.clubPlayers}</h2>
          {membershipsBySeason.map((group) => (
            <div className="standing-block" key={group.seasonId}>
              <h3>{group.seasonName}</h3>
              {group.memberships.map((membership) => (
                <p key={membership.id}>
                  <Link href={`/players/${membership.playerId}`}>{membership.player.lastName}, {membership.player.firstName}</Link>
                </p>
              ))}
            </div>
          ))}
        </article>
      </section>
    </main>
  );
}
