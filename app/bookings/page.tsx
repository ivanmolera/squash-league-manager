import Link from "next/link";
import { Navigation } from "@/app/navigation";
import { ClubCrest } from "@/src/components/club-crest";
import { activeClubWhere } from "@/src/lib/entity-activity";
import { requireFeature } from "@/src/lib/features";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

export default async function BookingsPage() {
  await requireFeature("court_bookings");
  const [clubs, { t }] = await Promise.all([
    prisma.club.findMany({
      where: { ...activeClubWhere, managesCourtBookings: true, availableCourts: { gt: 0 } },
      select: { id: true, name: true, city: true, logoUrl: true, availableCourts: true },
      orderBy: [{ city: "asc" }, { name: "asc" }]
    }),
    getDictionary()
  ]);

  return (
    <main className="app-shell">
      <Navigation />
      <section className="page-heading"><h1>{t.courtBookings}</h1></section>
      <section className="booking-club-list">
        {clubs.map((club) => (
          <Link className="booking-club-row" href={`/clubs/${club.id}#reservas`} key={club.id}>
            <ClubCrest clubName={club.name} logoUrl={club.logoUrl} size="small" />
            <span><strong>{club.name}</strong><small>{club.city} · {club.availableCourts} {t.availableCourts.toLowerCase()}</small></span>
            <span aria-hidden="true">›</span>
          </Link>
        ))}
        {!clubs.length ? <p className="muted">{t.noBookableClubs}</p> : null}
      </section>
    </main>
  );
}
