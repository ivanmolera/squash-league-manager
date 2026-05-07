import { prisma } from "@/src/lib/prisma";

const levelOrderByCategoryName = new Map([
  ["Primera", 1],
  ["Segunda", 2],
  ["Tercera", 3]
]);

export function playerAgeAt(referenceDate: Date, birthDate: Date | null) {
  if (!birthDate) return null;

  let age = referenceDate.getFullYear() - birthDate.getFullYear();
  const birthdayThisYear = new Date(referenceDate);
  birthdayThisYear.setMonth(birthDate.getMonth(), birthDate.getDate());
  if (referenceDate < birthdayThisYear) age -= 1;
  return age;
}

function levelOrderForCategoryName(name: string) {
  return levelOrderByCategoryName.get(name) ?? null;
}

async function rankingIdForCompetition(competition: { rankingId: string | null; rankingCode: string | null }) {
  if (competition.rankingId) return competition.rankingId;
  if (!competition.rankingCode || competition.rankingCode === "none") return null;

  const ranking = await prisma.ranking.findUnique({
    where: { code: competition.rankingCode },
    select: { id: true }
  });
  return ranking?.id ?? null;
}

async function assertPlayerMeetsCategoryRestrictions({
  playerId,
  category,
  referenceDate
}: {
  playerId: string;
  category: { genderScope: string; minAge: number | null; maxAge: number | null };
  referenceDate: Date;
}) {
  const player = await prisma.player.findUniqueOrThrow({
    where: { id: playerId },
    select: { gender: true, birthDate: true, mergedIntoPlayerId: true }
  });

  if (player.mergedIntoPlayerId) {
    throw new Error("Esta ficha de jugador está fusionada con otra ficha principal.");
  }

  const genderMatches = category.genderScope === "not_specified" || player.gender === category.genderScope;
  if (!genderMatches) {
    throw new Error("El jugador no cumple la restricción de género de esta categoría.");
  }

  const age = playerAgeAt(referenceDate, player.birthDate);
  if (category.minAge !== null && (age === null || age < category.minAge)) {
    throw new Error(`El jugador debe tener al menos ${category.minAge} años para inscribirse en esta categoría.`);
  }

  if (category.maxAge !== null && (age === null || age > category.maxAge)) {
    throw new Error(`El jugador debe tener como máximo ${category.maxAge} años para inscribirse en esta categoría.`);
  }
}

async function assertPlayerMeetsRankingLevel({
  playerId,
  rankingId,
  seasonId,
  categoryId,
  categoryName
}: {
  playerId: string;
  rankingId: string | null;
  seasonId: string;
  categoryId: string;
  categoryName: string;
}) {
  if (!rankingId) return;

  const targetLevelOrder = levelOrderForCategoryName(categoryName);
  if (!targetLevelOrder) return;

  const assignment = await prisma.playerRankingCategory.findFirst({
    where: {
      playerId,
      rankingId,
      seasonId,
      validTo: null,
      isLevelCategory: true
    },
    include: { category: true }
  });

  if (!assignment) return;
  if (assignment.categoryId === categoryId) return;

  throw new Error(`El jugador está asignado a ${assignment.category.name} para este ránquing y temporada.`);
}

export async function assertPlayerEligibleForCompetitionCategory(competitionCategoryId: string, playerId: string) {
  const competitionCategory = await prisma.competitionCategory.findUniqueOrThrow({
    where: { id: competitionCategoryId },
    include: {
      competition: { select: { seasonId: true, startsAt: true, rankingId: true, rankingCode: true } },
      category: true
    }
  });

  const referenceDate = competitionCategory.competition.startsAt ?? new Date();
  await assertPlayerMeetsCategoryRestrictions({
    playerId,
    category: competitionCategory.category,
    referenceDate
  });

  await assertPlayerMeetsRankingLevel({
    playerId,
    rankingId: await rankingIdForCompetition(competitionCategory.competition),
    seasonId: competitionCategory.competition.seasonId,
    categoryId: competitionCategory.categoryId,
    categoryName: competitionCategory.category.name
  });
}

export async function assertPlayerCanJoinTeam(teamId: string, playerId: string) {
  const team = await prisma.team.findUniqueOrThrow({
    where: { id: teamId },
    include: { ranking: true }
  });
  const category = await prisma.category.findUniqueOrThrow({
    where: { id: team.categoryId }
  });
  const season = await prisma.season.findUniqueOrThrow({
    where: { id: team.seasonId }
  });

  await assertPlayerMeetsCategoryRestrictions({
    playerId,
    category,
    referenceDate: season.startsAt
  });

  await assertPlayerMeetsRankingLevel({
    playerId,
    rankingId: team.rankingId,
    seasonId: team.seasonId,
    categoryId: team.categoryId,
    categoryName: category.name
  });

  if (!team.rankingId) return;

  const existingRoster = await prisma.teamRoster.findFirst({
    where: {
      playerId,
      seasonId: team.seasonId,
      categoryId: team.categoryId,
      toDate: null,
      teamId: { not: team.id },
      team: { rankingId: team.rankingId }
    },
    include: { team: true }
  });

  if (existingRoster) {
    throw new Error(`El jugador ya pertenece al equipo ${existingRoster.team.name} en esta categoría y ránquing.`);
  }
}
