import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelCourtReservationAction, reserveCourtAction } from "@/app/admin/actions";
import { Navigation } from "@/app/navigation";
import { ClubCrest } from "@/src/components/club-crest";
import { RankingCodeBadge } from "@/src/components/ranking-code-picker";
import { autonomousCommunityForLocation } from "@/src/lib/autonomous-communities";
import { getCurrentUser } from "@/src/lib/auth";
import { getFeatureSettings } from "@/src/lib/features";
import { getDictionary } from "@/src/lib/i18n";
import { formatPlayerListName } from "@/src/lib/names";
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
      closedDays: true
    }
  });
}

function weekStart(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = start.getUTCDay() || 7;
  start.setUTCDate(start.getUTCDate() - day + 1);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function slotDate(day: Date, hour: number, minute: number) {
  const date = new Date(day);
  date.setUTCHours(hour, minute, 0, 0);
  return date;
}

function formatDay(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(date);
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateFromKey(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function clampDate(date: Date, start: Date, endExclusive: Date) {
  if (date < start) return start;
  if (date >= endExclusive) return addDays(endExclusive, -1);
  return date;
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("ca", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }).format(date);
}

function isSlotCovered(reservation: { startsAt: Date; endsAt: Date }, startsAt: Date) {
  return reservation.startsAt <= startsAt && reservation.endsAt > startsAt;
}

function reservationLabel(reservation: { user: { displayName: string | null; email: string }; player: { firstName: string; lastName: string } | null; partnerPlayer: { firstName: string; lastName: string } | null }) {
  const owner = reservation.player ? formatPlayerListName(reservation.player) : reservation.user.displayName ?? reservation.user.email;
  return reservation.partnerPlayer ? `${owner} / ${formatPlayerListName(reservation.partnerPlayer)}` : owner;
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

export default async function ClubDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ bookingDate?: string }>;
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
  const bookingStart = weekStart();
  const bookingEnd = addDays(bookingStart, 14);
  const requestedBookingDate = dateFromKey(query?.bookingDate);
  const selectedBookingDate = clampDate(requestedBookingDate ?? new Date(), bookingStart, bookingEnd);
  selectedBookingDate.setUTCHours(0, 0, 0, 0);
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
            partnerPlayer: true
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
  const slots = Array.from({ length: 27 }, (_, index) => ({
    hour: 8 + Math.floor(index / 2),
    minute: index % 2 === 0 ? 0 : 30
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
        <article className="list-panel">
          <h2>{t.clubDetails}</h2>
          {community ? <div className="club-detail-community-flag"><RankingCodeBadge code={community.code} /></div> : null}
          <p><strong>{t.province}:</strong> {club.province ?? t.notProvidedFemale}</p>
          <p><strong>{t.city}:</strong> {club.city ?? t.notProvidedFemale}</p>
          <p><strong>{t.postalCode}:</strong> {club.postalCode ?? t.notProvided}</p>
          <p><strong>{t.availableCourts}:</strong> {club.availableCourts}</p>
          <p><strong>{t.clubPhone}:</strong> {canSeeContact ? club.phone ?? t.notProvided : t.privateValue}</p>
          <p><strong>{t.address}:</strong> {canSeeContact ? club.address ?? t.notProvidedFemale : t.privateFemaleValue}</p>
          <p><strong>{t.website}:</strong> {canSeeContact ? club.websiteUrl ?? t.notProvidedFemale : t.privateFemaleValue}</p>
          <p><strong>{t.assignedManager}:</strong> {club.manager?.displayName ?? club.manager?.email ?? t.noManager}</p>
          {mapUrl ? (
            <iframe
              className="club-map"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              src={mapUrl}
              title={`${club.name} · ${t.location}`}
            />
          ) : null}
        </article>
        {showBookings ? (
          <article className="list-panel full-width">
            <h2>{t.courtBookings}</h2>
            {!currentUser ? <p className="warning-box">{t.signInToBookCourt}</p> : null}
            {activeFutureReservation ? <p className="warning-box">{t.activeCourtReservationWarning}</p> : null}
            <div className="court-booking-toolbar">
              {previousBookingDate ? (
                <Link aria-label={t.previousDay} className="court-booking-arrow" href={`/clubs/${club.id}?bookingDate=${previousBookingDate}`}>‹</Link>
              ) : <span className="court-booking-arrow is-disabled">‹</span>}
              <form action={`/clubs/${club.id}`} className="court-date-form">
                <label>
                  <span>{t.selectDate}</span>
                  <input
                    max={dateKey(addDays(bookingEnd, -1))}
                    min={dateKey(bookingStart)}
                    name="bookingDate"
                    type="date"
                    defaultValue={selectedBookingDateKey}
                  />
                </label>
                <button type="submit">{t.showDate}</button>
              </form>
              {nextBookingDate ? (
                <Link aria-label={t.nextDay} className="court-booking-arrow" href={`/clubs/${club.id}?bookingDate=${nextBookingDate}`}>›</Link>
              ) : <span className="court-booking-arrow is-disabled">›</span>}
            </div>
            <div className="court-booking-summary-grid">
              <div>{formatDay(selectedBookingDate, locale)}</div>
              <div>{club.name}</div>
              <div>{t.activity}: {t.courtBookings}</div>
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
                        const reservation = selectedDayReservations.find((item) => item.courtNumber === courtIndex + 1 && isSlotCovered(item, startsAt));
                        const isPast = startsAt < new Date();
                        const isClosed = closedDayKeys.has(selectedBookingDateKey);
                        const canBook = currentUser && !reservation && !isPast && !isClosed && !activeFutureReservation;
                        const canBookOneHour = slot.hour < 20 || (slot.hour === 20 && slot.minute <= 30);

                        return (
                          <td className={reservation ? "reserved-slot" : isClosed ? "closed-slot" : ""} key={`${selectedBookingDateKey}-${courtIndex}-${slot.hour}-${slot.minute}`}>
                            {reservation ? (
                              <div className="slot-reservation">
                                <strong>{reservationLabel(reservation)}</strong>
                                <span>{formatTime(reservation.startsAt)}-{formatTime(reservation.endsAt)}</span>
                                {(reservation.userId === currentUser?.id || canEdit) ? (
                                  <form action={cancelCourtReservationAction}>
                                    <input type="hidden" name="reservationId" value={reservation.id} />
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
                                  <select name="durationSlots" defaultValue={canBookOneHour ? "2" : "1"}>
                                    <option value="1">30 min</option>
                                    <option value="2" disabled={!canBookOneHour}>60 min</option>
                                  </select>
                                  <button type="submit">{t.bookCourt}</button>
                                </form>
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
