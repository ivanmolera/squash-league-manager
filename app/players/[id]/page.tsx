import Link from "next/link";
import { notFound } from "next/navigation";
import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";
import { getTournamentRankingRows, type RankingScope } from "@/src/lib/tournament-rankings";

export const dynamic = "force-dynamic";

const rankingScopes: RankingScope[] = ["autonomic", "state", "psa"];
const rankingMatchTypes = ["tournament_knockout", "tournament_round_robin", "tournament_consolation", "tournament_third_place"] as const;
const completedStatuses = ["played", "walkover", "retired"] as const;

function PlayerPortrait({ player }: { player: { firstName: string; lastName: string; profilePhotoUrl: string | null; genericProfileVariant: string } }) {
  if (player.profilePhotoUrl) {
    return <img className="player-photo" src={player.profilePhotoUrl} alt={`${player.firstName} ${player.lastName}`} />;
  }

  return (
    <div className={`player-avatar ${player.genericProfileVariant}`} aria-hidden="true">
      <span className="avatar-head" />
      <span className="avatar-shoulders" />
    </div>
  );
}

function normalizeRankingSeriesKey(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(19|20)\d{2}\s*\/\s*(19|20)\d{2}\b/g, " ")
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function knockoutRoundPoints(roundNumber: number, totalRounds: number) {
  const roundsFromFinal = totalRounds - roundNumber;
  if (roundsFromFinal <= 0) return 200;
  if (roundsFromFinal === 1) return 100;
  if (roundsFromFinal === 2) return 50;
  if (roundsFromFinal === 3) return 25;
  return 10;
}

function roundWinPoints(match: { matchType: string; roundNumber: number | null }, totalRounds: number) {
  if (match.matchType === "tournament_round_robin") return 10;
  if (match.matchType === "tournament_third_place") return 50;
  return knockoutRoundPoints(match.roundNumber ?? 1, totalRounds);
}

type RankingEvolutionSeries = {
  scope: RankingScope;
  points: Array<{ label: string; position: number }>;
};

type RankingCompetition = {
  id: string;
  name: string;
  matches: Array<{
    homePlayerId: string | null;
    awayPlayerId: string | null;
    winnerPlayerId: string | null;
    homePlayerNameAtMatchTime: string | null;
    awayPlayerNameAtMatchTime: string | null;
    matchType: string;
    roundNumber: number | null;
  }>;
  participants: Array<{
    playerId: string | null;
    player: { firstName: string; lastName: string } | null;
  }>;
};

async function getPlayerRankingEvolution(playerId: string) {
  const series: RankingEvolutionSeries[] = [];

  for (const scope of rankingScopes) {
    const competitions = await prisma.competition.findMany({
      where: { type: "tournament", rankingScope: scope },
      include: {
        participants: {
          include: { player: true }
        },
        matches: {
          where: {
            winnerPlayerId: { not: null },
            matchType: { in: [...rankingMatchTypes] }
          },
          select: {
            homePlayerId: true,
            awayPlayerId: true,
            winnerPlayerId: true,
            homePlayerNameAtMatchTime: true,
            awayPlayerNameAtMatchTime: true,
            matchType: true,
            roundNumber: true
          }
        }
      },
      orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }]
    });

    const activeBySeries = new Map<string, typeof competitions[number]>();
    const points: RankingEvolutionSeries["points"] = [];

    for (const competition of competitions) {
      const seriesKey = normalizeRankingSeriesKey(competition.name) || competition.id;
      activeBySeries.set(seriesKey, competition);
      const rows = buildRankingRows([...activeBySeries.values()]);
      const playerIndex = rows.findIndex((row) => row.playerId === playerId && row.points > 0);
      if (playerIndex >= 0) {
        points.push({ label: competition.name, position: playerIndex + 1 });
      }
    }

    if (points.length) {
      series.push({ scope, points });
    }
  }

  return series;
}

function buildRankingRows(competitions: RankingCompetition[]) {
  const rows = new Map<string, {
    playerId: string;
    name: string;
    points: number;
    averagePoints: number;
    tournaments: Map<string, number>;
    wins: number;
  }>();

  const ensure = (playerId: string, name: string | null) => {
    const existing = rows.get(playerId) ?? {
      playerId,
      name: name ?? "Jugador",
      points: 0,
      averagePoints: 0,
      tournaments: new Map<string, number>(),
      wins: 0
    };
    rows.set(playerId, existing);
    return existing;
  };

  for (const competition of competitions) {
    const totalRounds = Math.max(...competition.matches.map((match) => match.roundNumber ?? 1), 1);

    for (const participant of competition.participants) {
      if (!participant.playerId || !participant.player) continue;
      const row = ensure(participant.playerId, `${participant.player.firstName} ${participant.player.lastName}`);
      row.tournaments.set(competition.id, row.tournaments.get(competition.id) ?? 0);
    }

    for (const match of competition.matches) {
      if (!match.winnerPlayerId) continue;
      const winnerName = match.winnerPlayerId === match.homePlayerId
        ? match.homePlayerNameAtMatchTime
        : match.awayPlayerNameAtMatchTime;
      const row = ensure(match.winnerPlayerId, winnerName);
      row.wins += 1;
      row.tournaments.set(
        competition.id,
        (row.tournaments.get(competition.id) ?? 0) + roundWinPoints(match, totalRounds)
      );
    }
  }

  for (const row of rows.values()) {
    row.points = [...row.tournaments.values()].reduce((total, value) => total + value, 0);
    row.averagePoints = row.points / Math.max(2, row.tournaments.size);
  }

  return [...rows.values()].sort((left, right) =>
    right.averagePoints - left.averagePoints ||
    right.points - left.points ||
    right.wins - left.wins ||
    left.name.localeCompare(right.name)
  );
}

async function getPlayerStatistics(playerId: string, membershipSeasonIds: string[]) {
  const [matches, finalRounds, registrations, rankingEvolution, currentRankings, latestMatches] = await Promise.all([
    prisma.match.findMany({
      where: {
        OR: [{ homePlayerId: playerId }, { awayPlayerId: playerId }],
        status: { in: [...completedStatuses] },
        winnerPlayerId: { not: null }
      },
      select: {
        id: true,
        seasonId: true,
        competitionId: true,
        competitionCategoryId: true,
        matchType: true,
        roundNumber: true,
        homePlayerId: true,
        awayPlayerId: true,
        winnerPlayerId: true,
        competition: { select: { id: true, type: true } }
      }
    }),
    prisma.match.groupBy({
      by: ["competitionId", "competitionCategoryId"],
      where: { matchType: "tournament_knockout" },
      _max: { roundNumber: true }
    }),
    prisma.tournamentRegistration.findMany({
      where: { playerId },
      select: { competitionCategory: { select: { competitionId: true } } }
    }),
    getPlayerRankingEvolution(playerId),
    Promise.all(rankingScopes.map(async (scope) => ({ scope, rows: await getTournamentRankingRows(scope) }))),
    prisma.match.findMany({
      where: {
        OR: [{ homePlayerId: playerId }, { awayPlayerId: playerId }],
        status: { in: [...completedStatuses] },
        winnerPlayerId: { not: null }
      },
      include: {
        competition: { select: { id: true, name: true, type: true } },
        sets: { orderBy: { setNumber: "asc" } }
      },
      orderBy: [{ playedAt: "desc" }, { scheduledAt: "desc" }],
      take: 5
    })
  ]);

  const finalRoundByCategory = new Map(
    finalRounds.map((row) => [`${row.competitionId}:${row.competitionCategoryId}`, row._max.roundNumber])
  );
  const tournamentIds = new Set<string>();
  const seasonIds = new Set(membershipSeasonIds);
  let finalsPlayed = 0;
  let tournamentsWon = 0;

  for (const registration of registrations) {
    tournamentIds.add(registration.competitionCategory.competitionId);
  }

  for (const match of matches) {
    seasonIds.add(match.seasonId);
    if (match.competition.type === "tournament") {
      tournamentIds.add(match.competitionId);
    }

    const finalRound = finalRoundByCategory.get(`${match.competitionId}:${match.competitionCategoryId}`);
    if (match.matchType === "tournament_knockout" && match.roundNumber && match.roundNumber === finalRound) {
      finalsPlayed += 1;
      if (match.winnerPlayerId === playerId) {
        tournamentsWon += 1;
      }
    }
  }

  const won = matches.filter((match) => match.winnerPlayerId === playerId).length;
  const lost = matches.length - won;
  const rankingPositions = currentRankings.flatMap((ranking) => {
    const index = ranking.rows.findIndex((row) => row.playerId === playerId && row.points > 0);
    return index >= 0 ? [{ scope: ranking.scope, position: index + 1 }] : [];
  });
  const rankingPoints = currentRankings.flatMap((ranking) => {
    const row = ranking.rows.find((item) => item.playerId === playerId && item.points > 0);
    return row ? [{ scope: ranking.scope, tournaments: row.tournaments, points: row.points, averagePoints: row.averagePoints }] : [];
  });
  const bestRanking = rankingPositions.sort((left, right) => left.position - right.position)[0] ?? null;

  return {
    seasonsPlayed: seasonIds.size,
    bestRanking,
    tournamentsPlayed: tournamentIds.size,
    totalMatchesPlayed: matches.length,
    won,
    lost,
    finalsPlayed,
    tournamentsWon,
    rankingEvolution,
    rankingPoints,
    latestMatches
  };
}

function matchScore(match: { sets: Array<{ homePoints: number; awayPoints: number }> }) {
  if (!match.sets.length) return "";
  const homeSets = match.sets.filter((set) => set.homePoints > set.awayPoints).length;
  const awaySets = match.sets.filter((set) => set.awayPoints > set.homePoints).length;
  const partials = match.sets.map((set) => `${set.homePoints}-${set.awayPoints}`).join(", ");
  return `${homeSets}-${awaySets}${partials ? ` (${partials})` : ""}`;
}

function formatMatchDate(value: Date | null, locale: string, fallback: string) {
  return value ? value.toLocaleDateString(locale, { dateStyle: "short" }) : fallback;
}

function DonutChart({ won, lost, labels }: { won: number; lost: number; labels: { won: string; lost: string } }) {
  const total = won + lost;
  const wonPercentage = total ? Math.round((won / total) * 100) : 0;
  const gradient = total
    ? `conic-gradient(var(--accent) 0 ${wonPercentage}%, #ef4444 ${wonPercentage}% 100%)`
    : "conic-gradient(#e2e8f0 0 100%)";

  return (
    <div className="player-donut" style={{ background: gradient }}>
      <div>
        <strong>{wonPercentage}%</strong>
        <span>{labels.won}</span>
      </div>
    </div>
  );
}

function PlayerRankingEvolutionChart({ series, labels }: { series: RankingEvolutionSeries[]; labels: Record<string, string> }) {
  if (!series.length) return null;

  const width = 760;
  const height = Math.max(220, series.length * 150);
  const left = 128;
  const right = 70;
  const top = 32;
  const rowHeight = (height - top - 42) / series.length;
  const colors = ["#0f766e", "#2563eb", "#9333ea"];

  return (
    <div className="evolution-scroll">
      <svg className="player-ranking-chart" role="img" viewBox={`0 0 ${width} ${height}`}>
        {series.map((item, seriesIndex) => {
          const points = item.points;
          const maxRank = Math.max(...points.map((point) => point.position), 1);
          const yTop = top + seriesIndex * rowHeight + 20;
          const plotHeight = Math.max(46, rowHeight - 58);
          const xFor = (index: number) => left + (points.length === 1 ? 0 : ((width - left - right) * index) / (points.length - 1));
          const yFor = (position: number) => yTop + (maxRank === 1 ? 0 : (plotHeight * (position - 1)) / (maxRank - 1));
          const coordinates = points.map((point, index) => `${xFor(index)},${yFor(point.position)}`).join(" ");
          const color = colors[seriesIndex % colors.length];

          return (
            <g key={item.scope}>
              <text className="evolution-player-label start-label" x={left - 18} y={yTop + 5} fill={color}>{labels[item.scope]}</text>
              <line className="evolution-grid" x1={left} x2={width - right} y1={yTop} y2={yTop} />
              <polyline fill="none" points={coordinates} stroke={color} strokeWidth="3" />
              {points.map((point, index) => (
                <g key={`${item.scope}-${index}`}>
                  <circle cx={xFor(index)} cy={yFor(point.position)} fill={color} r="5" />
                  <text className="evolution-rank-label" x={xFor(index)} y={yFor(point.position) - 10}>#{point.position}</text>
                </g>
              ))}
              <text className="evolution-player-label end-label" x={width - right + 14} y={yFor(points[points.length - 1].position) + 5} fill={color}>
                #{points[points.length - 1].position}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default async function PlayerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [player, currentUser] = await Promise.all([
    prisma.player.findUnique({
      where: { id },
      include: { user: true, memberships: { include: { club: true, season: true } } }
    }),
    getCurrentUser()
  ]);
  const { locale, t } = await getDictionary();

  if (!player) notFound();

  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));
  const canEdit = isAdmin || player.userId === currentUser?.id;
  const canSeeContact = canEdit || player.showContactPublic;
  const canSeePhysical = canEdit || player.showPhysicalPublic;
  const statistics = await getPlayerStatistics(player.id, player.memberships.map((membership) => membership.seasonId));
  const bestRanking = statistics.bestRanking
    ? `#${statistics.bestRanking.position} · ${t[statistics.bestRanking.scope as keyof typeof t]}`
    : t.notProvided;

  return (
    <main className="app-shell">
      <Navigation />
      <section className="detail-header">
        <div>
          <p className="eyebrow">{t.player}</p>
          <h1>{player.firstName} {player.lastName}</h1>
        </div>
        {canEdit ? <Link className="primary-link" href={`/players/${player.id}/edit`}>{t.edit}</Link> : null}
      </section>
      <section className="detail-grid">
        <article className="list-panel player-photo-card">
          <PlayerPortrait player={player} />
        </article>
        <article className="list-panel">
          <h2>{t.personalData}</h2>
          <p><strong>{t.email}:</strong> {canSeeContact ? player.user?.email ?? t.unavailable : t.privateValue}</p>
          <p><strong>{t.phone}:</strong> {canSeeContact ? player.user?.phone ?? t.notProvided : t.privateValue}</p>
          <p><strong>{t.gender}:</strong> {t[player.gender as keyof typeof t]}</p>
          <p><strong>{t.dominantHand}:</strong> {t[player.dominantHand as keyof typeof t]}</p>
          <p><strong>{t.height}:</strong> {canSeePhysical ? player.heightCm ?? t.notProvidedFemale : t.privateFemaleValue}</p>
          <p><strong>{t.weight}:</strong> {canSeePhysical ? String(player.weightKg ?? t.notProvided) : t.privateValue}</p>
          <p><strong>{t.racket}:</strong> {player.racketBrand ?? t.notProvidedFemale}</p>
        </article>
        <article className="list-panel">
          <h2>{t.clubs}</h2>
          {player.memberships.length ? player.memberships.map((membership) => (
            <p key={membership.id}>
              <Link href={`/clubs/${membership.club.id}`}>{membership.clubNameAtThatTime}</Link> · {membership.season.name}
            </p>
          )) : <p>{t.independent}</p>}
        </article>
      </section>
      <section className="list-panel full-width">
        <h2>{t.statistics}</h2>
        <div className="player-statistics-grid">
          <DonutChart won={statistics.won} lost={statistics.lost} labels={{ won: t.won, lost: t.lost }} />
          <div className="stat-metric-grid">
            <div><span>{t.seasonsPlayed}</span><strong>{statistics.seasonsPlayed}</strong></div>
            <div><span>{t.bestRanking}</span><strong>{bestRanking}</strong></div>
            <div><span>{t.tournamentsPlayed}</span><strong>{statistics.tournamentsPlayed}</strong></div>
            <div><span>{t.totalMatchesPlayed}</span><strong>{statistics.totalMatchesPlayed}</strong></div>
            <div><span>{t.won}</span><strong>{statistics.won}</strong></div>
            <div><span>{t.lost}</span><strong>{statistics.lost}</strong></div>
            <div><span>{t.tournamentFinalsPlayed}</span><strong>{statistics.finalsPlayed}</strong></div>
            <div><span>{t.tournamentsWon}</span><strong>{statistics.tournamentsWon}</strong></div>
          </div>
        </div>
        <div className="ranking-evolution-panel">
          <h3>{t.rankingEvolutionByScope}</h3>
          {statistics.rankingEvolution.length ? (
            <PlayerRankingEvolutionChart
              series={statistics.rankingEvolution}
              labels={{ autonomic: t.autonomic, state: t.state, psa: t.psa }}
            />
          ) : (
            <p className="muted">{t.noPlayerRankingEvolution}</p>
          )}
        </div>
      </section>
      <section className="detail-grid">
        <article className="list-panel">
          <h2>{t.rankingPoints}</h2>
          {statistics.rankingPoints.length ? (
            <div className="stat-metric-grid">
              {statistics.rankingPoints.map((ranking) => (
                <div key={ranking.scope}>
                  <span>{t[ranking.scope as keyof typeof t]}</span>
                  <strong>{Math.round(ranking.averagePoints * 10) / 10}</strong>
                  <small>{t.tournamentsPlayed}: {ranking.tournaments} · {t.totalPoints}: {ranking.points}</small>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">{t.noRankingResults}</p>
          )}
        </article>
        <article className="list-panel">
          <h2>{t.latestMatches}</h2>
          {statistics.latestMatches.length ? (
            <div className="latest-match-list">
              {statistics.latestMatches.map((match) => {
                const isHome = match.homePlayerId === player.id;
                const opponentName = isHome ? match.awayPlayerNameAtMatchTime : match.homePlayerNameAtMatchTime;
                const won = match.winnerPlayerId === player.id;
                return (
                  <div className="latest-match-row" key={match.id}>
                    <div>
                      <strong>{won ? t.won : t.lost} · {matchScore(match)}</strong>
                      <span>{t.opponent}: {opponentName ?? t.notProvided}</span>
                    </div>
                    <div>
                      <span>{match.competition.name}</span>
                      <small>{formatMatchDate(match.playedAt ?? match.scheduledAt, locale, t.noDate)}</small>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="muted">{t.noMatches}</p>
          )}
        </article>
      </section>
    </main>
  );
}
