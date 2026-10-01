import Link from "next/link";
import { ArrowUpRight, Building2, ListOrdered, Trophy, UsersRound } from "lucide-react";
import { HomeTournamentCarousel, type HomeTournamentSlide } from "@/app/home-tournament-carousel";
import { Navigation } from "@/app/navigation";
import { ClubCrest } from "@/src/components/club-crest";
import { getCurrentUser } from "@/src/lib/auth";
import { getFeatureSettings } from "@/src/lib/features";
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
  const [user, { locale, t }, clubs, features, playerCount, clubCount, leagueCount, tournamentCount] = await Promise.all([
    getCurrentUser(),
    getDictionary(),
    prisma.club.findMany({
      where: { logoUrl: { not: null } },
      orderBy: [{ province: "asc" }, { name: "asc" }],
      select: { id: true, name: true, logoUrl: true },
      take: 18
    }),
    getFeatureSettings(),
    prisma.player.count({ where: { mergedIntoPlayerId: null } }),
    prisma.club.count(),
    prisma.competition.count({ where: { type: { in: ["individual_league", "team_league"] } } }),
    prisma.competition.count({ where: { type: "tournament" } })
  ]);
  const homeTournaments = features.tournaments ? await getHomeTournaments(now) : [];
  const modules = [
    { title: t.players, count: playerCount, icon: UsersRound, href: "/admin/players" },
    { title: t.clubs, count: clubCount, icon: Building2, href: "/admin/clubs" },
    ...(features.leagues ? [{ title: t.leagues, count: leagueCount, icon: ListOrdered, href: "/admin/leagues" }] : []),
    ...(features.tournaments ? [{ title: t.tournaments, count: tournamentCount, icon: Trophy, href: "/manager/tournaments" }] : [])
  ];
  const sponsors = ["DROPSHOT", "VIBORA", "RACQTECH", "COURTLY", "SQUASH TV", "AUREA"];
  const slides = tournamentSlides({ tournaments: homeTournaments, locale, labels: t });

  return (
    <main className="app-shell">
      <Navigation />
      <section className="public-hero">
        <p className="eyebrow">{new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now)}</p>
        <h1>Squash<span>Flow</span><i aria-hidden="true">.</i></h1>
        {user ? <p className="hero-greeting">{t.hello}, {user.displayName ?? user.email}</p> : null}
      </section>

      <section className="module-grid" aria-label={t.publicAccess}>
        {modules.map((module) => {
          const Icon = module.icon;
          return (
            <Link className="module" href={module.href} key={module.href}>
              <div className="module-top"><Icon aria-hidden="true" size={22} /><ArrowUpRight aria-hidden="true" size={18} /></div>
              <strong>{module.count.toLocaleString(locale)}</strong>
              <span>{module.title}</span>
            </Link>
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
