import Link from "next/link";
import { notFound } from "next/navigation";
import { MatchResultForm } from "@/app/match-result-form";
import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { getFeatureSettings } from "@/src/lib/features";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AgendaPage({
  searchParams
}: {
  searchParams?: Promise<{ view?: string }>;
}) {
  const [user, features, { locale, t }, query] = await Promise.all([
    getCurrentUser(), getFeatureSettings(), getDictionary(), searchParams
  ]);
  const resultsView = query?.view === "results";
  if (resultsView ? !features.leagues || !features.player_result_entry : !features.leagues && !features.match_proposals) {
    notFound();
  }
  const playerId = user?.player?.id;
  const matches = playerId && features.leagues ? await prisma.match.findMany({
    where: {
      status: "scheduled",
      OR: [{ homePlayerId: playerId }, { awayPlayerId: playerId }],
      competition: { type: { in: ["individual_league", "team_league"] }, status: { not: "cancelled" } }
    },
    include: {
      competition: { select: { id: true, name: true, bestOfSets: true } },
      leagueMatchday: { select: { startsAt: true, endsAt: true } },
      sets: { orderBy: { setNumber: "asc" } }
    },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
    take: 50
  }) : [];
  const proposals = playerId && features.court_bookings && features.match_proposals && !resultsView ? await prisma.matchProposal.findMany({
    where: {
      status: "accepted",
      OR: [{ proposerPlayerId: playerId }, { acceptorPlayerId: playerId }],
      courtReservation: { status: "active", startsAt: { gte: new Date() } }
    },
    include: {
      club: { select: { name: true } },
      courtReservation: { select: { id: true, startsAt: true } },
      proposerPlayer: { select: { firstName: true, lastName: true } },
      acceptorPlayer: { select: { firstName: true, lastName: true } }
    },
    orderBy: { courtReservation: { startsAt: "asc" } },
    take: 20
  }) : [];

  return (
    <main className="app-shell">
      <Navigation />
      <section className="page-heading">
        <h1>{resultsView ? t.results : t.agenda}</h1>
      </section>
      {!user ? <div className="agenda-sign-in"><p>{t.signInToSeeAgenda}</p><Link className="primary-link" href="/login">{t.signIn}</Link></div> : null}
      {user && !playerId ? <p className="muted">{t.noUpcomingMatches}</p> : null}
      {playerId ? (
        <section className="agenda-list" aria-label={t.myUpcomingMatches}>
          {matches.map((match) => {
            const day = match.scheduledAt ?? match.leagueMatchday?.startsAt;
            return (
              <article className="agenda-match" key={match.id}>
                <div className="agenda-match-main">
                  <p className="agenda-date">{day?.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" }) ?? t.noDate}</p>
                  <div>
                    <strong>{match.homePlayerNameAtMatchTime ?? t.player} · {match.awayPlayerNameAtMatchTime ?? t.player}</strong>
                    <p><Link href={`/leagues/${match.competition.id}`}>{match.competition.name}</Link></p>
                    {match.homeClubNameAtMatchTime ? <span>{match.homeClubNameAtMatchTime}</span> : null}
                  </div>
                  {features.player_result_entry ? (
                    <details className="agenda-result-entry" open={resultsView}>
                      <summary>{t.saveResult}</summary>
                      <MatchResultForm match={match} labels={{ sets: t.sets, set: t.set, home: t.homeSide, away: t.awaySide, save: t.saveResult }} />
                    </details>
                  ) : null}
                </div>
              </article>
            );
          })}
          {proposals.map((proposal) => (
            <article className="agenda-match" key={proposal.id}>
              <div className="agenda-match-main">
                <p className="agenda-date">{proposal.courtReservation.startsAt.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" })}<br />{proposal.courtReservation.startsAt.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}</p>
                <div>
                  <strong>{proposal.proposerPlayer.firstName} {proposal.proposerPlayer.lastName} · {proposal.acceptorPlayer?.firstName} {proposal.acceptorPlayer?.lastName}</strong>
                  <p><Link href={`/clubs/${proposal.clubId}#reservas`}>{proposal.club.name}</Link></p>
                  <span>{proposal.type === "competitive" ? t.competitiveMatch : t.friendlyMatch}</span>
                  <p><Link href={`/bookings/${proposal.courtReservation.id}`}>{t.openBookingTicket}</Link></p>
                </div>
              </div>
            </article>
          ))}
          {!matches.length && !proposals.length ? <p className="muted">{t.noUpcomingMatches}</p> : null}
        </section>
      ) : null}
    </main>
  );
}
