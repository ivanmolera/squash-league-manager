import type { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";
import { formatPlayerListName } from "@/src/lib/names";

export type RankingScope = "autonomic" | "state" | "psa";
export type RankingCode = string;

const rankingMatchTypes = ["tournament_knockout", "tournament_round_robin", "tournament_consolation", "tournament_third_place"] as const;

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

function roundWinPoints(match: {
  matchType: string;
  roundNumber: number | null;
}, totalRounds: number) {
  if (match.matchType === "tournament_round_robin") return 10;
  if (match.matchType === "tournament_third_place") return 50;
  return knockoutRoundPoints(match.roundNumber ?? 1, totalRounds);
}

function rankingCompetitionWhere(scopeOrCode: RankingScope | RankingCode): Prisma.CompetitionWhereInput {
  if (scopeOrCode === "autonomic" || scopeOrCode === "state" || scopeOrCode === "psa") {
    return { rankingScope: scopeOrCode };
  }

  return { rankingCode: scopeOrCode };
}

export async function getTournamentRankingRows(scopeOrCode: RankingScope | RankingCode, playerIds?: string[]) {
  const competitions = await prisma.competition.findMany({
    where: {
      type: "tournament",
      ...rankingCompetitionWhere(scopeOrCode)
    },
    include: {
      participants: {
        where: playerIds?.length ? { playerId: { in: playerIds } } : undefined,
        include: { player: true }
      },
      matches: {
        where: {
          winnerPlayerId: { not: null },
          matchType: { in: [...rankingMatchTypes] },
          ...(playerIds?.length
            ? { OR: [{ homePlayerId: { in: playerIds } }, { awayPlayerId: { in: playerIds } }, { winnerPlayerId: { in: playerIds } }] }
            : {})
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
    orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }]
  });
  const latestBySeries = new Map<string, typeof competitions[number]>();

  for (const competition of competitions) {
    const seriesKey = normalizeRankingSeriesKey(competition.name) || competition.id;
    if (!latestBySeries.has(seriesKey)) {
      latestBySeries.set(seriesKey, competition);
    }
  }

  const rows = new Map<string, {
    playerId: string;
    name: string;
    totalPoints: number;
    averagePoints: number;
    tournaments: Map<string, number>;
    wins: number;
  }>();

  const ensure = (playerId: string, name: string | null) => {
    const existing = rows.get(playerId) ?? {
      playerId,
      name: name ?? "Jugador",
      totalPoints: 0,
      averagePoints: 0,
      tournaments: new Map<string, number>(),
      wins: 0
    };
    rows.set(playerId, existing);
    return existing;
  };

  for (const competition of latestBySeries.values()) {
    const totalRounds = Math.max(...competition.matches.map((match) => match.roundNumber ?? 1), 1);

    for (const participant of competition.participants) {
      if (!participant.playerId || !participant.player) continue;
      const row = ensure(participant.playerId, formatPlayerListName(participant.player));
      row.tournaments.set(competition.id, row.tournaments.get(competition.id) ?? 0);
    }

    for (const match of competition.matches) {
      if (!match.winnerPlayerId) continue;
      if (playerIds?.length && !playerIds.includes(match.winnerPlayerId)) continue;
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
    row.totalPoints = [...row.tournaments.values()].reduce((total, points) => total + points, 0);
    row.averagePoints = row.totalPoints / Math.max(2, row.tournaments.size);
  }

  return [...rows.values()]
    .filter((row) => row.tournaments.size > 0)
    .sort((left, right) =>
      right.averagePoints - left.averagePoints ||
      right.totalPoints - left.totalPoints ||
      right.wins - left.wins ||
      left.name.localeCompare(right.name)
    )
    .map((row) => ({
      playerId: row.playerId,
      name: row.name,
      points: row.totalPoints,
      averagePoints: row.averagePoints,
      tournaments: row.tournaments.size,
      wins: row.wins
    }));
}
