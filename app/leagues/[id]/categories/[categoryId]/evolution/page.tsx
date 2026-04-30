import Link from "next/link";
import { notFound } from "next/navigation";
import { Navigation } from "@/app/navigation";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

type Participant = {
  id: string;
  name: string;
  sortName: string;
};

type RankingMode = "individual" | "team";

type RankingStats = {
  won: number;
  drawn: number;
  lost: number;
  setsFor: number;
  setsAgainst: number;
  pointsFor: number;
  pointsAgainst: number;
};

type EvolutionPoint = {
  round: number;
  label: string;
  positions: Map<string, number>;
};

const colors = ["#0f766e", "#dc2626", "#2563eb", "#9333ea", "#ea580c", "#16a34a", "#be123c", "#4f46e5", "#0891b2", "#ca8a04"];

function setWins(match: { sets: Array<{ homePoints: number; awayPoints: number }> }, side: "home" | "away") {
  return match.sets.filter((set) => side === "home" ? set.homePoints > set.awayPoints : set.awayPoints > set.homePoints).length;
}

function points(match: { sets: Array<{ homePoints: number; awayPoints: number }> }, side: "home" | "away") {
  return match.sets.reduce((total, set) => total + (side === "home" ? set.homePoints : set.awayPoints), 0);
}

function rankParticipants(participants: Participant[], stats: Map<string, RankingStats>, mode: RankingMode) {
  return [...participants]
    .sort((left, right) => {
      const leftStats = stats.get(left.id) ?? emptyStats();
      const rightStats = stats.get(right.id) ?? emptyStats();

      if (mode === "team") {
        return rightStats.setsFor - leftStats.setsFor ||
          (rightStats.pointsFor - rightStats.pointsAgainst) - (leftStats.pointsFor - leftStats.pointsAgainst) ||
          rightStats.pointsFor - leftStats.pointsFor ||
          left.sortName.localeCompare(right.sortName);
      }

      const leftPlayed = leftStats.won + leftStats.lost;
      const rightPlayed = rightStats.won + rightStats.lost;
      const leftWinPct = leftPlayed ? leftStats.won / leftPlayed : 0;
      const rightWinPct = rightPlayed ? rightStats.won / rightPlayed : 0;

      return rightStats.won - leftStats.won ||
        rightWinPct - leftWinPct ||
        (rightStats.setsFor - rightStats.setsAgainst) - (leftStats.setsFor - leftStats.setsAgainst) ||
        (rightStats.pointsFor - rightStats.pointsAgainst) - (leftStats.pointsFor - leftStats.pointsAgainst) ||
        rightStats.pointsFor - leftStats.pointsFor ||
        left.sortName.localeCompare(right.sortName);
    })
    .map((participant, index) => ({ playerId: participant.id, position: index + 1 }));
}

function emptyStats(): RankingStats {
  return { won: 0, drawn: 0, lost: 0, setsFor: 0, setsAgainst: 0, pointsFor: 0, pointsAgainst: 0 };
}

function addIndividualMatchToStats(
  stats: Map<string, RankingStats>,
  match: {
    homePlayerId: string | null;
    awayPlayerId: string | null;
    winnerPlayerId: string | null;
    sets: Array<{ homePoints: number; awayPoints: number }>;
  }
) {
  if (!match.homePlayerId || !match.awayPlayerId || !match.winnerPlayerId) return;

  const home = stats.get(match.homePlayerId) ?? emptyStats();
  const away = stats.get(match.awayPlayerId) ?? emptyStats();
  home.won += match.winnerPlayerId === match.homePlayerId ? 1 : 0;
  home.lost += match.winnerPlayerId === match.awayPlayerId ? 1 : 0;
  home.setsFor += setWins(match, "home");
  home.setsAgainst += setWins(match, "away");
  home.pointsFor += points(match, "home");
  home.pointsAgainst += points(match, "away");
  away.won += match.winnerPlayerId === match.awayPlayerId ? 1 : 0;
  away.lost += match.winnerPlayerId === match.homePlayerId ? 1 : 0;
  away.setsFor += setWins(match, "away");
  away.setsAgainst += setWins(match, "home");
  away.pointsFor += points(match, "away");
  away.pointsAgainst += points(match, "home");
  stats.set(match.homePlayerId, home);
  stats.set(match.awayPlayerId, away);
}

function isCompleted(match: { status: string; winnerPlayerId: string | null }) {
  return ["played", "walkover", "retired"].includes(match.status) && Boolean(match.winnerPlayerId);
}

function addTeamTieToStats(
  stats: Map<string, RankingStats>,
  tie: {
    homeTeamId: string;
    awayTeamId: string;
  },
  matches: Array<{
    status: string;
    homePlayerId: string | null;
    awayPlayerId: string | null;
    winnerPlayerId: string | null;
    sets: Array<{ homePoints: number; awayPoints: number }>;
  }>
) {
  const completedMatches = matches.filter(isCompleted);
  if (completedMatches.length === 0) return;

  const home = stats.get(tie.homeTeamId) ?? emptyStats();
  const away = stats.get(tie.awayTeamId) ?? emptyStats();
  let homeRubbers = 0;
  let awayRubbers = 0;

  for (const match of completedMatches) {
    if (match.winnerPlayerId === match.homePlayerId) homeRubbers += 1;
    if (match.winnerPlayerId === match.awayPlayerId) awayRubbers += 1;
    home.pointsFor += points(match, "home");
    home.pointsAgainst += points(match, "away");
    away.pointsFor += points(match, "away");
    away.pointsAgainst += points(match, "home");
  }

  home.setsFor += homeRubbers;
  home.setsAgainst += awayRubbers;
  away.setsFor += awayRubbers;
  away.setsAgainst += homeRubbers;

  if (homeRubbers > awayRubbers) {
    home.won += 1;
    away.lost += 1;
  } else if (awayRubbers > homeRubbers) {
    away.won += 1;
    home.lost += 1;
  } else {
    home.drawn += 1;
    away.drawn += 1;
  }

  stats.set(tie.homeTeamId, home);
  stats.set(tie.awayTeamId, away);
}

function buildIndividualEvolution(
  participants: Participant[],
  matches: Array<{
    roundNumber: number | null;
    status: string;
    homePlayerId: string | null;
    awayPlayerId: string | null;
    winnerPlayerId: string | null;
    sets: Array<{ homePoints: number; awayPoints: number }>;
  }>
) {
  const completedRounds = [...new Set(matches
    .filter((match) => match.roundNumber && match.status === "played" && match.winnerPlayerId)
    .map((match) => match.roundNumber!))]
    .sort((left, right) => left - right);
  const stats = new Map<string, RankingStats>();
  const points: EvolutionPoint[] = [
    {
      round: 0,
      label: "start",
      positions: new Map(rankParticipants(participants, stats, "individual").map((row) => [row.playerId, row.position]))
    }
  ];

  for (const round of completedRounds) {
    for (const match of matches.filter((item) => item.roundNumber === round && item.status === "played")) {
      addIndividualMatchToStats(stats, match);
    }
    points.push({
      round,
      label: String(round),
      positions: new Map(rankParticipants(participants, stats, "individual").map((row) => [row.playerId, row.position]))
    });
  }

  return points;
}

function buildTeamEvolution(
  participants: Participant[],
  teamTies: Array<{
    id: string;
    homeTeamId: string;
    awayTeamId: string;
    scheduledAt: Date | null;
  }>,
  matches: Array<{
    teamTieId: string | null;
    status: string;
    homePlayerId: string | null;
    awayPlayerId: string | null;
    winnerPlayerId: string | null;
    sets: Array<{ homePoints: number; awayPoints: number }>;
  }>
) {
  const matchesByTie = new Map<string, typeof matches>();
  for (const match of matches) {
    if (!match.teamTieId) continue;
    const rows = matchesByTie.get(match.teamTieId) ?? [];
    rows.push(match);
    matchesByTie.set(match.teamTieId, rows);
  }

  const groups = teamTies.reduce<Array<{ key: string; scheduledAt: Date | null; ties: typeof teamTies }>>((accumulator, tie) => {
    const tieMatches = matchesByTie.get(tie.id) ?? [];
    if (!tieMatches.some(isCompleted)) return accumulator;
    const key = tie.scheduledAt?.toISOString().slice(0, 10) ?? `tie-${tie.id}`;
    const group = accumulator.find((item) => item.key === key);
    if (group) group.ties.push(tie);
    else accumulator.push({ key, scheduledAt: tie.scheduledAt, ties: [tie] });
    return accumulator;
  }, []);

  groups.sort((left, right) => (left.scheduledAt?.getTime() ?? 0) - (right.scheduledAt?.getTime() ?? 0));

  const stats = new Map<string, RankingStats>();
  const evolution: EvolutionPoint[] = [
    {
      round: 0,
      label: "start",
      positions: new Map(rankParticipants(participants, stats, "team").map((row) => [row.playerId, row.position]))
    }
  ];

  groups.forEach((group, index) => {
    for (const tie of group.ties) {
      addTeamTieToStats(stats, tie, matchesByTie.get(tie.id) ?? []);
    }
    evolution.push({
      round: index + 1,
      label: String(index + 1),
      positions: new Map(rankParticipants(participants, stats, "team").map((row) => [row.playerId, row.position]))
    });
  });

  return evolution;
}

function EvolutionChart({ participants, evolution, startLabel, matchdayLabel }: { participants: Participant[]; evolution: EvolutionPoint[]; startLabel: string; matchdayLabel: string }) {
  const width = Math.max(760, evolution.length * 180);
  const height = Math.max(360, participants.length * 42 + 100);
  const left = 210;
  const right = 240;
  const top = 44;
  const bottom = 58;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const xFor = (index: number) => left + (evolution.length === 1 ? 0 : (plotWidth * index) / (evolution.length - 1));
  const yFor = (position: number) => top + (participants.length === 1 ? 0 : (plotHeight * (position - 1)) / (participants.length - 1));

  return (
    <div className="evolution-scroll">
      <svg className="evolution-chart" role="img" viewBox={`0 0 ${width} ${height}`}>
        {participants.map((_, index) => {
          const rank = index + 1;
          return (
            <g key={rank}>
              <line className="evolution-grid" x1={left} x2={width - right} y1={yFor(rank)} y2={yFor(rank)} />
            </g>
          );
        })}
        {evolution.map((point, index) => (
          <g key={point.round}>
            <line className="evolution-axis-line" x1={xFor(index)} x2={xFor(index)} y1={top} y2={height - bottom} />
            <text className="evolution-round-label" x={xFor(index)} y={height - 20}>{point.round === 0 ? startLabel : `${matchdayLabel} ${point.label}`}</text>
          </g>
        ))}
        {participants.map((participant, participantIndex) => {
          const color = colors[participantIndex % colors.length];
          const coordinates = evolution
            .map((point, index) => `${xFor(index)},${yFor(point.positions.get(participant.id) ?? participants.length)}`)
            .join(" ");
          const firstPoint = evolution[0];
          const lastPoint = evolution[evolution.length - 1];
          const firstPosition = firstPoint.positions.get(participant.id) ?? participants.length;
          const lastPosition = lastPoint.positions.get(participant.id) ?? participants.length;
          const firstY = yFor(firstPosition);
          const lastY = yFor(lastPosition);

          return (
            <g key={participant.id}>
              <text className="evolution-player-label start-label" fill={color} x={left - 18} y={firstY + 5}>{participant.name}</text>
              <polyline fill="none" points={coordinates} stroke={color} strokeWidth="3" />
              {evolution.map((point, index) => (
                <circle cx={xFor(index)} cy={yFor(point.positions.get(participant.id) ?? participants.length)} fill={color} key={point.round} r="5" />
              ))}
              <text className="evolution-player-label end-label" fill={color} x={width - right + 18} y={lastY + 5}>#{lastPosition}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default async function LeagueCategoryEvolutionPage({
  params
}: {
  params: Promise<{ id: string; categoryId: string }>;
}) {
  const { id, categoryId } = await params;
  const competitionCategory = await prisma.competitionCategory.findFirst({
    where: { id: categoryId, competitionId: id },
    include: { category: true, competition: true }
  });
  const { t } = await getDictionary();

  if (!competitionCategory || !["individual_league", "team_league"].includes(competitionCategory.competition.type)) {
    notFound();
  }

  const { participants, evolution } = competitionCategory.competition.type === "team_league"
    ? await getTeamEvolutionData(id, categoryId)
    : await getIndividualEvolutionData(id, categoryId);

  return (
    <main className="app-shell">
      <Navigation />
      <section className="detail-header">
        <div>
          <p className="eyebrow">{t.evolution}</p>
          <h1>{competitionCategory.displayName}</h1>
          <p className="muted">{competitionCategory.competition.name}</p>
        </div>
        <Link className="primary-link" href={`/leagues/${competitionCategory.competition.id}`}>{t.backToLeague}</Link>
      </section>
      <section className="list-panel full-width">
        <h2>{t.rankingEvolution}</h2>
        <p className="muted">{t.rankingEvolutionText}</p>
        {evolution.length > 1 ? (
          <EvolutionChart participants={participants} evolution={evolution} startLabel={t.start} matchdayLabel={t.matchday} />
        ) : (
          <p className="muted">{t.noEvolutionData}</p>
        )}
      </section>
    </main>
  );
}

async function getIndividualEvolutionData(competitionId: string, competitionCategoryId: string) {
  const [participants, matches] = await Promise.all([
    prisma.competitionParticipant.findMany({
      where: { competitionId, competitionCategoryId, playerId: { not: null } },
      include: { player: true }
    }),
    prisma.match.findMany({
      where: { competitionId, competitionCategoryId, matchType: "individual_league" },
      include: { sets: { orderBy: { setNumber: "asc" } } },
      orderBy: [{ roundNumber: "asc" }, { matchOrder: "asc" }]
    })
  ]);

  const playerRows = participants
    .flatMap((participant) => participant.player ? [{
      id: participant.player.id,
      name: `${participant.player.lastName}, ${participant.player.firstName}`,
      sortName: `${participant.player.lastName}, ${participant.player.firstName}`
    }] : [])
    .sort((left, right) => left.sortName.localeCompare(right.sortName));

  return {
    participants: playerRows,
    evolution: buildIndividualEvolution(playerRows, matches)
  };
}

async function getTeamEvolutionData(competitionId: string, competitionCategoryId: string) {
  const [teamTies, matches] = await Promise.all([
    prisma.teamTie.findMany({
      where: { competitionId, competitionCategoryId },
      orderBy: [{ scheduledAt: "asc" }, { homeTeamNameAtTime: "asc" }]
    }),
    prisma.match.findMany({
      where: { competitionId, competitionCategoryId, matchType: "team_rubber" },
      include: { sets: { orderBy: { setNumber: "asc" } } },
      orderBy: [{ scheduledAt: "asc" }, { matchOrder: "asc" }]
    })
  ]);

  const teams = new Map<string, Participant>();
  for (const tie of teamTies) {
    teams.set(tie.homeTeamId, {
      id: tie.homeTeamId,
      name: tie.homeTeamNameAtTime ?? "Equipo local",
      sortName: tie.homeTeamNameAtTime ?? "Equipo local"
    });
    teams.set(tie.awayTeamId, {
      id: tie.awayTeamId,
      name: tie.awayTeamNameAtTime ?? "Equipo visitante",
      sortName: tie.awayTeamNameAtTime ?? "Equipo visitante"
    });
  }

  const teamRows = [...teams.values()].sort((left, right) => left.sortName.localeCompare(right.sortName));

  return {
    participants: teamRows,
    evolution: buildTeamEvolution(teamRows, teamTies, matches)
  };
}
