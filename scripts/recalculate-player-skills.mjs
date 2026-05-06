import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const initialLevel = 3.5;
const ratingMatchTypes = [
  "individual_league",
  "team_rubber",
  "tournament_knockout",
  "tournament_round_robin",
  "tournament_consolation",
  "tournament_third_place"
];

function clampSkillLevel(value) {
  return Math.max(0, Math.min(7, Math.round(value * 100) / 100));
}

function expectedScore(playerLevel, opponentLevel) {
  return 1 / (1 + 10 ** ((opponentLevel - playerLevel) / 2));
}

function skillKFactor(reliability) {
  return Math.max(0.05, 0.45 / Math.sqrt(Math.max(1, reliability + 1)));
}

function nextSkillLevel(playerLevel, opponentLevel, reliability, actualScore) {
  const expected = expectedScore(playerLevel, opponentLevel);
  return clampSkillLevel(playerLevel + skillKFactor(reliability) * (actualScore - expected));
}

function matchDate(match) {
  return match.playedAt ?? match.scheduledAt ?? match.createdAt;
}

async function main() {
  const players = await prisma.player.findMany({
    where: { mergedIntoPlayerId: null },
    select: { id: true }
  });
  const state = new Map(players.map((player) => [player.id, { level: initialLevel, reliability: 0 }]));

  const matches = await prisma.match.findMany({
    where: {
      matchType: { in: ratingMatchTypes },
      status: { in: ["played", "retired"] },
      homePlayerId: { not: null },
      awayPlayerId: { not: null },
      winnerPlayerId: { not: null }
    },
    select: {
      id: true,
      homePlayerId: true,
      awayPlayerId: true,
      winnerPlayerId: true,
      playedAt: true,
      scheduledAt: true,
      createdAt: true
    }
  });

  matches.sort((left, right) => matchDate(left).getTime() - matchDate(right).getTime() || left.id.localeCompare(right.id));

  let appliedMatches = 0;
  for (const match of matches) {
    if (!match.homePlayerId || !match.awayPlayerId || !match.winnerPlayerId) continue;
    if (match.winnerPlayerId !== match.homePlayerId && match.winnerPlayerId !== match.awayPlayerId) continue;
    const loserPlayerId = match.winnerPlayerId === match.homePlayerId ? match.awayPlayerId : match.homePlayerId;
    const winner = state.get(match.winnerPlayerId);
    const loser = state.get(loserPlayerId);
    if (!winner || !loser) continue;

    const winnerBefore = winner.level;
    const loserBefore = loser.level;
    winner.level = nextSkillLevel(winnerBefore, loserBefore, winner.reliability, 1);
    loser.level = nextSkillLevel(loserBefore, winnerBefore, loser.reliability, 0);
    winner.reliability += 1;
    loser.reliability += 1;
    appliedMatches += 1;
  }

  const updates = players.map((player) => {
    const rating = state.get(player.id) ?? { level: initialLevel, reliability: 0 };
    return prisma.player.update({
      where: { id: player.id },
      data: {
        skillLevel: rating.level,
        skillReliability: rating.reliability,
        skillLevelConfirmed: true
      }
    });
  });

  for (let index = 0; index < updates.length; index += 100) {
    await prisma.$transaction(updates.slice(index, index + 100));
  }

  console.log(`Initialized ${players.length} active player profiles from ${initialLevel.toFixed(2)}.`);
  console.log(`Applied ${appliedMatches} historical league/tournament results.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
