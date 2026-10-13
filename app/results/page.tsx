import type { CompetitionType, Prisma } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MatchResultForm } from "@/app/match-result-form";
import { MatchProposalResultForm } from "@/app/match-proposal-result-form";
import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { courtDateKey } from "@/src/lib/court-booking-time";
import { getFeatureSettings } from "@/src/lib/features";
import { getDictionary } from "@/src/lib/i18n";
import { formatMatchSchedule, formatMatchScore, isUpcomingScheduledMatch } from "@/src/lib/personal-results";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

const matchSelect = {
  id: true,
  status: true,
  createdAt: true,
  scheduledAt: true,
  playedAt: true,
  venueClubId: true,
  court: true,
  homePlayerId: true,
  awayPlayerId: true,
  homePlayerNameAtMatchTime: true,
  awayPlayerNameAtMatchTime: true,
  competition: { select: { id: true, name: true, type: true, bestOfSets: true, hostClub: { select: { name: true } } } },
  leagueMatchday: { select: { startsAt: true, endsAt: true } },
  sets: { orderBy: { setNumber: "asc" as const }, select: { setNumber: true, homePoints: true, awayPoints: true } }
} satisfies Prisma.MatchSelect;

export default async function ResultsPage() {
  const [user, features, { locale, t }] = await Promise.all([getCurrentUser(), getFeatureSettings(), getDictionary()]);
  const showProposals = features.court_bookings && features.match_proposals;
  if (!features.leagues && !features.tournaments && !showProposals) notFound();

  const playerId = user?.player?.id;
  const now = new Date();
  const today = new Date(`${courtDateKey(now)}T00:00:00.000Z`);
  const competitionTypes: CompetitionType[] = [
    ...(features.leagues ? ["individual_league" as const, "team_league" as const] : []),
    ...(features.tournaments ? ["tournament" as const] : [])
  ];
  const matchWhere = playerId && competitionTypes.length ? {
    OR: [{ homePlayerId: playerId }, { awayPlayerId: playerId }],
    competition: { type: { in: competitionTypes }, status: { not: "cancelled" as const } }
  } : null;

  const [scheduledMatches, pendingMatches, completedMatches, acceptedProposals, pendingProposals, completedProposals] = await Promise.all([
    matchWhere ? prisma.match.findMany({
      where: {
        ...matchWhere,
        status: "scheduled",
        AND: [{ OR: [
          { scheduledAt: { gte: now } },
          { scheduledAt: null, leagueMatchday: { endsAt: { gte: today } } },
          { scheduledAt: null, leagueMatchdayId: null }
        ] }]
      },
      select: matchSelect,
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
      take: 60
    }) : [],
    matchWhere ? prisma.match.findMany({
      where: {
        ...matchWhere,
        status: "scheduled",
        AND: [{ OR: [
          { scheduledAt: { lt: now } },
          { scheduledAt: null, leagueMatchday: { endsAt: { lt: today } } }
        ] }]
      },
      select: matchSelect,
      orderBy: [{ scheduledAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: 30
    }) : [],
    matchWhere ? prisma.match.findMany({
      where: { ...matchWhere, status: { in: ["played", "walkover", "retired"] } },
      select: matchSelect,
      orderBy: [{ playedAt: { sort: "desc", nulls: "last" } }, { scheduledAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: 30
    }) : [],
    playerId && showProposals ? prisma.matchProposal.findMany({
      where: {
        status: "accepted",
        OR: [{ proposerPlayerId: playerId }, { acceptorPlayerId: playerId }],
        courtReservation: { status: "active", endsAt: { gt: now } }
      },
      include: {
        club: { select: { name: true } },
        courtReservation: { select: { id: true, courtNumber: true, startsAt: true } },
        proposerPlayer: { select: { firstName: true, lastName: true } },
        acceptorPlayer: { select: { firstName: true, lastName: true } }
      },
      orderBy: { courtReservation: { startsAt: "asc" } },
      take: 30
    }) : [],
    playerId && showProposals ? prisma.matchProposal.findMany({
      where: {
        status: "accepted",
        OR: [{ proposerPlayerId: playerId }, { acceptorPlayerId: playerId }],
        courtReservation: { status: "active", endsAt: { lte: now } }
      },
      include: {
        club: { select: { name: true } },
        courtReservation: { select: { startsAt: true, courtNumber: true } },
        proposerPlayer: { select: { firstName: true, lastName: true } },
        acceptorPlayer: { select: { firstName: true, lastName: true } }
      },
      orderBy: { courtReservation: { startsAt: "desc" } },
      take: 30
    }) : [],
    playerId && showProposals ? prisma.matchProposal.findMany({
      where: {
        status: "completed",
        OR: [{ proposerPlayerId: playerId }, { acceptorPlayerId: playerId }]
      },
      include: {
        club: { select: { name: true } },
        courtReservation: { select: { startsAt: true } },
        proposerPlayer: { select: { firstName: true, lastName: true } },
        acceptorPlayer: { select: { firstName: true, lastName: true } }
      },
      orderBy: { completedAt: { sort: "desc", nulls: "last" } },
      take: 30
    }) : []
  ]);

  const allMatches = [...scheduledMatches, ...pendingMatches, ...completedMatches];
  const venueIds = [...new Set(allMatches.map((match) => match.venueClubId).filter((id): id is string => Boolean(id)))];
  const participantIds = [...new Set(allMatches.flatMap((match) => [match.homePlayerId, match.awayPlayerId]).filter((id): id is string => Boolean(id)))];
  const [venueClubs, participants] = await Promise.all([
    venueIds.length ? prisma.club.findMany({ where: { id: { in: venueIds } }, select: { id: true, name: true } }) : [],
    participantIds.length ? prisma.player.findMany({ where: { id: { in: participantIds } }, select: { id: true, firstName: true, lastName: true } }) : []
  ]);
  const venueNames = new Map(venueClubs.map((club) => [club.id, club.name]));
  const participantNames = new Map(participants.map((player) => [player.id, `${player.firstName} ${player.lastName}`]));
  const matchPlayerName = (id: string | null, snapshot: string | null) =>
    (id ? participantNames.get(id) : null) ?? snapshot ?? t.player;
  const matchVenue = (match: (typeof scheduledMatches)[number]) =>
    (match.venueClubId ? venueNames.get(match.venueClubId) : null) ?? match.competition.hostClub?.name ?? t.venueToBeConfirmed;
  const competitionUrl = (match: (typeof scheduledMatches)[number]) =>
    match.competition.type === "tournament" ? `/tournaments/${match.competition.id}` : `/leagues/${match.competition.id}`;
  const playerName = (player: { firstName: string; lastName: string } | null) =>
    player ? `${player.firstName} ${player.lastName}` : t.player;

  const upcomingItems = [
    ...scheduledMatches.filter((match) => isUpcomingScheduledMatch(match, now)).map((match) => ({ kind: "match" as const, match, at: match.scheduledAt ?? match.leagueMatchday?.startsAt ?? null })),
    ...acceptedProposals.map((proposal) => ({ kind: "proposal" as const, proposal, at: proposal.courtReservation.startsAt }))
  ].sort((left, right) => (left.at?.getTime() ?? Number.MAX_SAFE_INTEGER) - (right.at?.getTime() ?? Number.MAX_SAFE_INTEGER));
  const completedItems = [
    ...completedMatches.map((match) => ({ kind: "match" as const, match, at: match.playedAt ?? match.scheduledAt ?? match.leagueMatchday?.endsAt ?? match.createdAt })),
    ...completedProposals.map((proposal) => ({ kind: "proposal" as const, proposal, at: proposal.completedAt ?? proposal.courtReservation.startsAt }))
  ].sort((left, right) => right.at.getTime() - left.at.getTime()).slice(0, 30);

  return (
    <main className="app-shell">
      <Navigation />
      <section className="page-heading"><h1>{t.results}</h1></section>
      {!user ? <div className="agenda-sign-in"><p>{t.signInToSeeAgenda}</p><Link className="primary-link" href="/login">{t.signIn}</Link></div> : null}
      {user && !playerId ? <p className="muted">{t.noUpcomingMatches}</p> : null}
      {playerId ? (
        <>
          <section className="personal-results-section" aria-labelledby="upcoming-results-heading">
            <h2 id="upcoming-results-heading">{t.upcomingMatches}</h2>
            {upcomingItems.length ? <div className="agenda-list personal-results-list">
              {upcomingItems.map((item) => item.kind === "match" ? (
                <article className="agenda-match" key={`match-${item.match.id}`}>
                  <div className="agenda-match-main">
                    <p className="agenda-date">{formatMatchSchedule(item.match, locale, t.dateToBeConfirmed)}</p>
                    <div>
                      <strong>{matchPlayerName(item.match.homePlayerId, item.match.homePlayerNameAtMatchTime)} · {matchPlayerName(item.match.awayPlayerId, item.match.awayPlayerNameAtMatchTime)}</strong>
                      <p><Link href={competitionUrl(item.match)}>{item.match.competition.name}</Link></p>
                      <p className="personal-results-venue">{t.venue}: {matchVenue(item.match)}{item.match.court ? ` · ${t.court} ${item.match.court}` : ""}</p>
                    </div>
                    {features.player_result_entry && item.match.competition.type !== "tournament" && item.match.homePlayerId && item.match.awayPlayerId ? (
                      <details className="agenda-result-entry">
                        <summary>{t.saveResult}</summary>
                        <MatchResultForm match={item.match} labels={{ sets: t.sets, set: t.set, home: t.homeSide, away: t.awaySide, save: t.saveResult }} />
                      </details>
                    ) : null}
                  </div>
                </article>
              ) : (
                <article className="agenda-match" key={`proposal-${item.proposal.id}`}>
                  <div className="agenda-match-main">
                    <p className="agenda-date">{formatMatchSchedule({ scheduledAt: item.proposal.courtReservation.startsAt, leagueMatchday: null }, locale, t.dateToBeConfirmed)}</p>
                    <div>
                      <strong>{playerName(item.proposal.proposerPlayer)} · {playerName(item.proposal.acceptorPlayer)}</strong>
                      <p>{item.proposal.type === "competitive" ? t.competitiveMatch : t.friendlyMatch}</p>
                      <p className="personal-results-venue">{t.venue}: <Link href={`/clubs/${item.proposal.clubId}#reservas`}>{item.proposal.club.name}</Link> · {t.court} {item.proposal.courtReservation.courtNumber}</p>
                      <Link href={`/bookings/${item.proposal.courtReservation.id}`}>{t.openBookingTicket}</Link>
                    </div>
                  </div>
                </article>
              ))}
            </div> : <p className="muted">{t.noUpcomingMatches}</p>}
          </section>
          {pendingMatches.length || pendingProposals.length ? (
            <section className="personal-results-section" aria-labelledby="pending-results-heading">
              <h2 id="pending-results-heading">{t.pendingResults}</h2>
              <div className="agenda-list personal-results-list">
                {pendingMatches.map((match) => (
                  <article className="agenda-match" key={match.id}>
                    <div className="agenda-match-main">
                      <p className="agenda-date">{formatMatchSchedule(match, locale, t.dateToBeConfirmed)}</p>
                      <div>
                        <strong>{matchPlayerName(match.homePlayerId, match.homePlayerNameAtMatchTime)} · {matchPlayerName(match.awayPlayerId, match.awayPlayerNameAtMatchTime)}</strong>
                        <p><Link href={competitionUrl(match)}>{match.competition.name}</Link></p>
                        <p className="personal-results-venue">{t.venue}: {matchVenue(match)}{match.court ? ` · ${t.court} ${match.court}` : ""}</p>
                      </div>
                      {features.player_result_entry && match.competition.type !== "tournament" && match.homePlayerId && match.awayPlayerId ? (
                        <details className="agenda-result-entry">
                          <summary>{t.saveResult}</summary>
                          <MatchResultForm match={match} labels={{ sets: t.sets, set: t.set, home: t.homeSide, away: t.awaySide, save: t.saveResult }} />
                        </details>
                      ) : null}
                    </div>
                  </article>
                ))}
                {pendingProposals.map((proposal) => (
                  <article className="agenda-match" key={`proposal-${proposal.id}`}>
                    <div className="agenda-match-main">
                      <p className="agenda-date">{formatMatchSchedule({ scheduledAt: proposal.courtReservation.startsAt, leagueMatchday: null }, locale, t.dateToBeConfirmed)}</p>
                      <div>
                        <strong>{playerName(proposal.proposerPlayer)} · {playerName(proposal.acceptorPlayer)}</strong>
                        <p>{proposal.type === "competitive" ? t.competitiveMatch : t.friendlyMatch}</p>
                        <p className="personal-results-venue">{t.venue}: <Link href={`/clubs/${proposal.clubId}`}>{proposal.club.name}</Link> · {t.court} {proposal.courtReservation.courtNumber}</p>
                      </div>
                      <details className="agenda-result-entry">
                        <summary>{t.saveResult}</summary>
                        <MatchProposalResultForm clubId={proposal.clubId} proposal={proposal} t={t} />
                      </details>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
          <section className="personal-results-section" aria-labelledby="past-results-heading">
            <h2 id="past-results-heading">{t.recentResults}</h2>
            {completedItems.length ? <div className="agenda-list personal-results-list">
              {completedItems.map((item) => item.kind === "match" ? (
                <article className="agenda-match" key={`match-${item.match.id}`}>
                  <div className="agenda-match-main">
                    <p className="agenda-date">{formatMatchSchedule({ scheduledAt: item.match.playedAt ?? item.match.scheduledAt, leagueMatchday: item.match.leagueMatchday }, locale, t.dateToBeConfirmed)}</p>
                    <div>
                      <strong>{matchPlayerName(item.match.homePlayerId, item.match.homePlayerNameAtMatchTime)} · {matchPlayerName(item.match.awayPlayerId, item.match.awayPlayerNameAtMatchTime)}</strong>
                      <p><Link href={competitionUrl(item.match)}>{item.match.competition.name}</Link></p>
                      <p className="personal-results-venue">{t.venue}: {matchVenue(item.match)}</p>
                    </div>
                    <strong className="personal-results-score">{formatMatchScore({ status: item.match.status as "played" | "walkover" | "retired", sets: item.match.sets })}</strong>
                  </div>
                </article>
              ) : (
                <article className="agenda-match" key={`proposal-${item.proposal.id}`}>
                  <div className="agenda-match-main">
                    <p className="agenda-date">{formatMatchSchedule({ scheduledAt: item.proposal.courtReservation.startsAt, leagueMatchday: null }, locale, t.dateToBeConfirmed)}</p>
                    <div>
                      <strong>{playerName(item.proposal.proposerPlayer)} · {playerName(item.proposal.acceptorPlayer)}</strong>
                      <p>{item.proposal.type === "competitive" ? t.competitiveMatch : t.friendlyMatch}</p>
                      <p className="personal-results-venue">{t.venue}: <Link href={`/clubs/${item.proposal.clubId}`}>{item.proposal.club.name}</Link></p>
                    </div>
                    <strong className="personal-results-score">{item.proposal.scoreSummary ?? "-"}</strong>
                  </div>
                </article>
              ))}
            </div> : <p className="muted">{t.noPastResults}</p>}
          </section>
        </>
      ) : null}
    </main>
  );
}
