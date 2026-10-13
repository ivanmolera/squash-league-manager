import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Navigation } from "@/app/navigation";
import { getCurrentUser, isManagerFor } from "@/src/lib/auth";
import { bookingTicketStatus } from "@/src/lib/booking-ticket-status";
import { bookingTicketQrDataUrl } from "@/src/lib/booking-ticket";
import { courtDateKey, formatCourtBookingDay, formatCourtBookingTime } from "@/src/lib/court-booking-time";
import { requireFeature } from "@/src/lib/features";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function BookingTicketPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ email?: string }>;
}) {
  await requireFeature("court_bookings");
  const [{ id }, query, currentUser, { locale, t }] = await Promise.all([
    params,
    searchParams,
    getCurrentUser(),
    getDictionary()
  ]);
  if (!uuidPattern.test(id)) notFound();
  if (!currentUser) redirect("/login");

  const reservation = await prisma.courtReservation.findUnique({
    where: { id },
    select: {
      id: true,
      clubId: true,
      courtNumber: true,
      userId: true,
      startsAt: true,
      endsAt: true,
      status: true,
      club: { select: { name: true, managerUserId: true } },
      matchProposal: { select: { status: true, acceptorUserId: true } }
    }
  });
  if (!reservation) notFound();

  const isOwner = reservation.userId === currentUser.id || reservation.matchProposal?.acceptorUserId === currentUser.id;
  const isClubManager = isManagerFor(currentUser, reservation.club.managerUserId);
  const isAdmin = !currentUser.previewAsPlayer && currentUser.roles.some((role) => role.role === "admin");
  if (!isOwner && !isClubManager && !isAdmin) notFound();

  const status = bookingTicketStatus(reservation);
  const statusLabel = {
    valid: t.bookingTicketValid,
    cancelled: t.bookingTicketCancelled,
    expired: t.bookingTicketExpired,
    pending: t.bookingTicketPending,
    completed: t.bookingTicketCompleted
  }[status];
  const qr = status === "valid" && isOwner ? await bookingTicketQrDataUrl(id) : null;

  return (
    <main className="app-shell">
      <Navigation />
      <section className="page-heading"><h1>{t.bookingTicket}</h1></section>
      <section className="booking-ticket" aria-labelledby="booking-ticket-club">
        <div className="booking-ticket-details">
          <span className={`booking-ticket-status is-${status}`}>{statusLabel}</span>
          <h2 id="booking-ticket-club">{reservation.club.name}</h2>
          <p>{t.court} {reservation.courtNumber}</p>
          <p>{formatCourtBookingDay(reservation.startsAt, locale)}</p>
          <p>{formatCourtBookingTime(reservation.startsAt)} - {formatCourtBookingTime(reservation.endsAt)}</p>
          <small>{t.bookingReference}: {reservation.id}</small>
        </div>
        {qr ? (
          <div className="booking-ticket-qr">
            <img src={qr} width="256" height="256" alt={t.bookingQrLabel} />
            <p>{t.bookingQrHelp}</p>
          </div>
        ) : null}
      </section>
      {query.email === "unavailable" && isOwner ? <p className="warning-box">{t.bookingTicketEmailUnavailable}</p> : null}
      <Link className="back-link" href={`/clubs/${reservation.clubId}?bookingDate=${courtDateKey(reservation.startsAt)}#reservas`}>{reservation.club.name}</Link>
    </main>
  );
}
