import Link from "next/link";
import { History, IdCard, ListChecks, Trophy } from "lucide-react";
import { HomeTournamentCarousel, type HomeTournamentSlide } from "@/app/home-tournament-carousel";
import { Navigation } from "@/app/navigation";
import { ClubCrest } from "@/src/components/club-crest";
import { getCurrentUser } from "@/src/lib/auth";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

type HomeTournament = Awaited<ReturnType<typeof getHomeTournaments>>[number];

function dateRangeLabel(start: Date | null, end: Date | null, locale: string, noDate: string) {
  const startLabel = start?.toLocaleDateString(locale, { day: "numeric", month: "short" }) ?? noDate;
  const endLabel = end?.toLocaleDateString(locale, { day: "numeric", month: "short" }) ?? startLabel;
  return startLabel === endLabel ? startLabel : `${startLabel} - ${endLabel}`;
}

function tournamentSlides({
  tournaments,
  locale,
  labels
}: {
  tournaments: HomeTournament[];
  locale: string;
  labels: Record<string, string>;
}): HomeTournamentSlide[] {
  return tournaments.map((tournament) => ({
    id: `upcoming-${tournament.id}`,
    href: `/tournaments/${tournament.id}`,
    title: tournament.name,
    statusLabel: labels.upcomingTournament,
    dateLabel: dateRangeLabel(tournament.startsAt, tournament.endsAt, locale, labels.noDate),
    locationLabel: tournament.hostClub?.name ?? labels.noVenue,
    detailLabel: `${labels.registration}: ${tournament.registrationDeadline?.toLocaleDateString(locale) ?? labels.noDeadline}`
  }));
}

function getHomeTournaments(now: Date) {
  const tournamentInclude = {
    hostClub: { select: { id: true, name: true, logoUrl: true } },
    matches: {
      select: {
        id: true,
        competitionCategoryId: true,
        matchType: true,
        status: true,
        roundNumber: true,
        winnerPlayerId: true,
        homePlayerId: true,
        awayPlayerId: true,
        homePlayerNameAtMatchTime: true,
        awayPlayerNameAtMatchTime: true
      }
    }
  };

  return prisma.competition.findMany({
    where: { type: "tournament", startsAt: { gte: now } },
    include: tournamentInclude,
    orderBy: [{ startsAt: "asc" }, { name: "asc" }],
    take: 5
  });
}

export default async function Home() {
  const now = new Date();
  const [user, { locale, t }, clubs, homeTournaments] = await Promise.all([
    getCurrentUser(),
    getDictionary(),
    prisma.club.findMany({
      where: { logoUrl: { not: null } },
      orderBy: [{ province: "asc" }, { name: "asc" }],
      select: { id: true, name: true, logoUrl: true },
      take: 18
    }),
    getHomeTournaments(now)
  ]);
  const roles = user?.roles.map((role) => role.role).join(", ");
  const modules = [
    { title: t.moduleCompetitions, text: t.moduleCompetitionsText, icon: Trophy },
    { title: t.moduleResults, text: t.moduleResultsText, icon: ListChecks },
    { title: t.moduleHistory, text: t.moduleHistoryText, icon: History },
    { title: t.moduleProfiles, text: t.moduleProfilesText, icon: IdCard }
  ];
  const sponsors = ["DROPSHOT", "VIBORA", "RACQTECH", "COURTLY", "SQUASH TV", "AUREA"];
  const slides = tournamentSlides({ tournaments: homeTournaments, locale, labels: t });

  return (
    <main className="app-shell">
      <Navigation />
      <section className="public-hero">
        <p className="eyebrow">Squash League Manager</p>
        <h1>{user ? `${t.hello}, ${user.displayName ?? user.email}` : t.homeTitle}</h1>
        {user ? <p className="muted">{t.activeRole}: {roles}</p> : null}
      </section>

      <section className="module-grid" aria-label={t.publicAccess}>
        {modules.map((module) => {
          const Icon = module.icon;
          return (
            <article className="module" key={module.title}>
              <Icon aria-hidden="true" size={24} />
              <h2>{module.title}</h2>
              <p>{module.text}</p>
            </article>
          );
        })}
      </section>

      {clubs.length ? (
        <section className="home-club-strip" aria-label={t.clubLogos}>
          {clubs.map((club) => (
            <Link href={`/clubs/${club.id}`} key={club.id} title={club.name}>
              <ClubCrest logoUrl={club.logoUrl} clubName={club.name} size="tiny" />
            </Link>
          ))}
        </section>
      ) : null}

      <HomeTournamentCarousel slides={slides} title={t.featuredTournaments} />

      <section className="sponsor-strip" aria-label={t.sponsors}>
        <h2>{t.sponsors}</h2>
        <div>
          {sponsors.map((sponsor) => (
            <span className="sponsor-logo" key={sponsor}>{sponsor}</span>
          ))}
        </div>
      </section>
    </main>
  );
}
