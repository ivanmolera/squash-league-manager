import Link from "next/link";
import { Navigation } from "@/app/navigation";
import { ClubCrest } from "@/src/components/club-crest";
import { getCurrentUser } from "@/src/lib/auth";
import { bookingTicketStatus } from "@/src/lib/booking-ticket-status";
import { COURT_BOOKING_TIME_ZONE, formatCourtBookingTime } from "@/src/lib/court-booking-time";
import { activeClubWhere } from "@/src/lib/entity-activity";
import { requireFeature } from "@/src/lib/features";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

export default async function BookingsPage() {
  await requireFeature("court_bookings");
  const [user, clubs, { locale, t }] = await Promise.all([
    getCurrentUser(),
    prisma.club.findMany({
      where: { ...activeClubWhere, managesCourtBookings: true, availableCourts: { gt: 0 } },
      select: { id: true, name: true, city: true, logoUrl: true, availableCourts: true },
      orderBy: [{ city: "asc" }, { name: "asc" }]
    }),
    getDictionary()
  ]);
  const reservations = user ? await prisma.courtReservation.findMany({
    where: {
      OR: [
        { userId: user.id },
        { matchProposal: { is: { acceptorUserId: user.id } } }
      ]
    },
    select: {
      id: true,
      courtNumber: true,
      startsAt: true,
      endsAt: true,
      status: true,
      club: { select: { name: true } },
      matchProposal: { select: { status: true } }
    },
    orderBy: { startsAt: "desc" }
  }) : [];
  const now = new Date();
  const upcoming = reservations
    .filter((reservation) => reservation.endsAt > now && bookingTicketStatus(reservation, now) !== "cancelled")
    .reverse();
  const past = reservations.filter((reservation) => reservation.endsAt <= now);
  const cancelled = reservations.filter((reservation) => reservation.endsAt > now && bookingTicketStatus(reservation, now) === "cancelled");
  const statusLabels = {
    valid: t.bookingTicketValid,
    cancelled: t.bookingTicketCancelled,
    expired: t.bookingTicketExpired,
    pending: t.bookingTicketPending,
    completed: t.bookingTicketCompleted
  };
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: COURT_BOOKING_TIME_ZONE,
    weekday: "long",
    year: "numeric"
  });
  const renderReservations = (items: typeof reservations) => (
    <div className="booking-reservation-list">
      {items.map((reservation) => {
        const status = bookingTicketStatus(reservation, now);
        return (
          <article className="booking-reservation-row" key={reservation.id}>
            <div className="booking-reservation-club"><strong>{reservation.club.name}</strong><span>{t.court} {reservation.courtNumber}</span></div>
            <time dateTime={reservation.startsAt.toISOString()}>{dateFormatter.format(reservation.startsAt)}</time>
            <span className="booking-reservation-time">{formatCourtBookingTime(reservation.startsAt)} - {formatCourtBookingTime(reservation.endsAt)}</span>
            <span className={`booking-ticket-status is-${status}`}>{statusLabels[status]}</span>
            <Link href={`/bookings/${reservation.id}`}>{t.viewReservation}</Link>
          </article>
        );
      })}
    </div>
  );

  return (
    <main className="app-shell">
      <Navigation />
      <section className="page-heading"><h1>{t.courtBookings}</h1></section>
      <section className="booking-reservations" aria-labelledby="my-bookings-heading">
        <h2 id="my-bookings-heading">{t.myReservations}</h2>
        {user ? (
          <>
            <h3>{t.upcomingReservations}</h3>
            {upcoming.length ? renderReservations(upcoming) : <p className="muted">{t.noUpcomingReservations}</p>}
            <h3>{t.pastReservations}</h3>
            {past.length ? renderReservations(past) : <p className="muted">{t.noPastReservations}</p>}
            {cancelled.length ? <><h3>{t.cancelledReservations}</h3>{renderReservations(cancelled)}</> : null}
          </>
        ) : <div className="agenda-sign-in"><p>{t.signInToSeeReservations}</p><Link className="primary-link" href="/login">{t.signIn}</Link></div>}
      </section>
      <section className="booking-clubs" aria-labelledby="bookable-clubs-heading">
        <h2 id="bookable-clubs-heading">{t.bookableClubs}</h2>
        <div className="booking-club-list">
          {clubs.map((club) => (
            <Link className="booking-club-row" href={`/clubs/${club.id}#reservas`} key={club.id}>
              <ClubCrest clubName={club.name} logoUrl={club.logoUrl} size="small" />
              <span><strong>{club.name}</strong><small>{club.city} · {club.availableCourts} {t.availableCourts.toLowerCase()}</small></span>
              <span aria-hidden="true">›</span>
            </Link>
          ))}
          {!clubs.length ? <p className="muted">{t.noBookableClubs}</p> : null}
        </div>
      </section>
    </main>
  );
}
