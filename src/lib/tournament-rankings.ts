import type { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";
import { formatPlayerListName } from "@/src/lib/names";

export type RankingScope = "autonomic" | "state" | "psa";
export type RankingCode = string;

type RankingRowAccumulator = {
  playerId: string;
  name: string;
  totalPoints: number;
  averagePoints: number;
  tournaments: Map<string, number>;
  wins: number;
};

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

function playerAgeAt(referenceDate: Date, birthDate: Date | null) {
  if (!birthDate) return null;
  let age = referenceDate.getFullYear() - birthDate.getFullYear();
  const birthdayThisYear = new Date(referenceDate);
  birthdayThisYear.setMonth(birthDate.getMonth(), birthDate.getDate());
  if (referenceDate < birthdayThisYear) age -= 1;
  return age;
}

function playerMatchesCategoryRestrictions(
  player: { gender: string; birthDate: Date | null },
  category: { genderScope: string; minAge: number | null; maxAge: number | null },
  referenceDate: Date
) {
  if (category.genderScope !== "not_specified" && player.gender !== category.genderScope) {
    return false;
  }

  const age = playerAgeAt(referenceDate, player.birthDate);
  if (category.minAge !== null && (age === null || age < category.minAge)) {
    return false;
  }

  if (category.maxAge !== null && (age === null || age > category.maxAge)) {
    return false;
  }

  return true;
}

function toSortedRankingRows(rows: Iterable<RankingRowAccumulator>) {
  const items = [...rows];

  for (const row of items) {
    row.totalPoints = [...row.tournaments.values()].reduce((total, points) => total + points, 0);
    row.averagePoints = row.totalPoints / Math.max(2, row.tournaments.size);
  }

  return items
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

  const rows = new Map<string, RankingRowAccumulator>();

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

  return toSortedRankingRows(rows.values());
}

export async function getTournamentRankingCategoryGroups(scopeOrCode: RankingScope | RankingCode) {
  const competitions = await prisma.competition.findMany({
    where: {
      type: "tournament",
      ...rankingCompetitionWhere(scopeOrCode)
    },
    include: {
      categories: {
        include: {
          category: true,
          participants: {
            include: { player: true }
          }
        }
      },
      matches: {
        where: {
          winnerPlayerId: { not: null },
          matchType: { in: [...rankingMatchTypes] }
        },
        select: {
          competitionCategoryId: true,
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
  const latestCategoriesBySeries = new Map<string, {
    competition: typeof competitions[number];
    competitionCategory: typeof competitions[number]["categories"][number];
  }>();

  for (const competition of competitions) {
    for (const competitionCategory of competition.categories) {
      const tournamentSeriesKey = normalizeRankingSeriesKey(competition.name) || competition.id;
      const categorySeriesKey = normalizeRankingSeriesKey(competitionCategory.category.name || competitionCategory.displayName);
      const seriesKey = `${tournamentSeriesKey}:${categorySeriesKey || competitionCategory.categoryId}`;
      if (!latestCategoriesBySeries.has(seriesKey)) {
        latestCategoriesBySeries.set(seriesKey, { competition, competitionCategory });
      }
    }
  }

  const groups = new Map<string, {
    categoryId: string;
    categoryName: string;
    sortOrder: number;
    rows: Map<string, RankingRowAccumulator>;
  }>();

  const groupFor = (competitionCategory: typeof competitions[number]["categories"][number]) => {
    const key = competitionCategory.categoryId;
    const existing = groups.get(key) ?? {
      categoryId: key,
      categoryName: competitionCategory.category.name,
      sortOrder: competitionCategory.category.sortOrder,
      rows: new Map<string, RankingRowAccumulator>()
    };
    groups.set(key, existing);
    return existing;
  };

  const ensure = (
    group: ReturnType<typeof groupFor>,
    playerId: string,
    name: string | null
  ) => {
    const existing = group.rows.get(playerId) ?? {
      playerId,
      name: name ?? "Jugador",
      totalPoints: 0,
      averagePoints: 0,
      tournaments: new Map<string, number>(),
      wins: 0
    };
    group.rows.set(playerId, existing);
    return existing;
  };

  for (const { competition, competitionCategory } of latestCategoriesBySeries.values()) {
    const group = groupFor(competitionCategory);
    const tournamentKey = `${competition.id}:${competitionCategory.id}`;
    const categoryMatches = competition.matches.filter((match) => match.competitionCategoryId === competitionCategory.id);
    const totalRounds = Math.max(...categoryMatches.map((match) => match.roundNumber ?? 1), 1);
    const referenceDate = competition.startsAt ?? new Date();
    const eligiblePlayerIds = new Set(
      competitionCategory.participants
        .filter((participant) =>
          participant.player &&
          playerMatchesCategoryRestrictions(participant.player, competitionCategory.category, referenceDate)
        )
        .map((participant) => participant.playerId)
        .filter(Boolean) as string[]
    );

    for (const participant of competitionCategory.participants) {
      if (!participant.playerId || !participant.player) continue;
      if (!eligiblePlayerIds.has(participant.playerId)) continue;
      const row = ensure(group, participant.playerId, formatPlayerListName(participant.player));
      row.tournaments.set(tournamentKey, row.tournaments.get(tournamentKey) ?? 0);
    }

    for (const match of categoryMatches) {
      if (!match.winnerPlayerId) continue;
      if (!eligiblePlayerIds.has(match.winnerPlayerId)) continue;
      const winnerName = match.winnerPlayerId === match.homePlayerId
        ? match.homePlayerNameAtMatchTime
        : match.awayPlayerNameAtMatchTime;
      const row = ensure(group, match.winnerPlayerId, winnerName);
      row.wins += 1;
      row.tournaments.set(
        tournamentKey,
        (row.tournaments.get(tournamentKey) ?? 0) + roundWinPoints(match, totalRounds)
      );
    }
  }

  return [...groups.values()]
    .map((group) => ({
      categoryId: group.categoryId,
      categoryName: group.categoryName,
      sortOrder: group.sortOrder,
      rows: toSortedRankingRows(group.rows.values())
    }))
    .filter((group) => group.rows.some((row) => row.points > 0))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.categoryName.localeCompare(right.categoryName));
}
