import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const tournamentName = "Torneig demo evolucio ranquing 2026";
const tournamentStart = new Date("2026-05-16T09:00:00.000Z");
const tournamentEnd = new Date("2026-05-17T18:00:00.000Z");
const categoryNames = ["Segunda", "Tercera"];
let seed = 20260506;

function random() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function playerName(player) {
  return `${player.firstName} ${player.lastName}`.trim();
}

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function winningSet(winnerSide) {
  const loserScore = Math.floor(random() * 9);
  return winnerSide === "home"
    ? { homePoints: 11, awayPoints: loserScore }
    : { homePoints: loserScore, awayPoints: 11 };
}

function closeWinningSet(winnerSide) {
  const loserScore = 9 + Math.floor(random() * 7);
  const winnerScore = loserScore + 2;
  return winnerSide === "home"
    ? { homePoints: winnerScore, awayPoints: loserScore }
    : { homePoints: loserScore, awayPoints: winnerScore };
}

function randomSet(winnerSide) {
  return random() < 0.25 ? closeWinningSet(winnerSide) : winningSet(winnerSide);
}

function randomMatchSets(winnerSide) {
  const loserSetWins = Math.floor(random() * 3);
  const setWinners = [
    ...Array.from({ length: 3 }, () => winnerSide),
    ...Array.from({ length: loserSetWins }, () => winnerSide === "home" ? "away" : "home")
  ];
  return shuffle(setWinners).map((side, index) => ({
    setNumber: index + 1,
    ...randomSet(side)
  }));
}

async function getSeason() {
  return prisma.season.findFirst({
    where: {
      status: "active",
      name: { contains: "/" },
      startsAt: { lte: tournamentStart },
      endsAt: { gte: tournamentStart }
    },
    orderBy: { startsAt: "desc" }
  }) ?? prisma.season.findFirst({ orderBy: { startsAt: "desc" } });
}

async function getRanking() {
  return prisma.ranking.upsert({
    where: { code: "CAT" },
    update: { scope: "autonomic", active: true },
    create: {
      code: "CAT",
      name: "Ranquing Catalunya",
      scope: "autonomic",
      active: true,
      sortOrder: 10
    }
  });
}

async function playersForCategory(category, ranking, season) {
  const ranked = await prisma.playerRankingCategory.findMany({
    where: {
      rankingId: ranking.id,
      categoryId: category.id,
      seasonId: season.id,
      validTo: null,
      player: { mergedIntoPlayerId: null }
    },
    include: { player: true },
    orderBy: [{ levelOrder: "asc" }, { player: { lastName: "asc" } }, { player: { firstName: "asc" } }]
  });
  const selected = ranked.map((entry) => entry.player);
  const selectedIds = new Set(selected.map((player) => player.id));

  if (selected.length < 8) {
    const fillers = await prisma.player.findMany({
      where: {
        mergedIntoPlayerId: null,
        id: { notIn: [...selectedIds] }
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 32
    });
    selected.push(...shuffle(fillers).slice(0, 8 - selected.length));
  }

  return shuffle(selected).slice(0, 8);
}

async function createPlayedMatch({
  season,
  competition,
  competitionCategory,
  roundNumber,
  bracketPosition,
  matchType,
  homePlayer,
  awayPlayer,
  scheduledAt
}) {
  const winnerSide = random() < 0.5 ? "home" : "away";
  const winner = winnerSide === "home" ? homePlayer : awayPlayer;
  const match = await prisma.match.create({
    data: {
      seasonId: season.id,
      competitionId: competition.id,
      competitionCategoryId: competitionCategory.id,
      matchType,
      status: "played",
      roundNumber,
      bracketPosition,
      scheduledAt,
      playedAt: scheduledAt,
      venueClubId: competition.hostClubId,
      homePlayerId: homePlayer.id,
      awayPlayerId: awayPlayer.id,
      winnerPlayerId: winner.id,
      homePlayerNameAtMatchTime: playerName(homePlayer),
      awayPlayerNameAtMatchTime: playerName(awayPlayer)
    }
  });
  await prisma.matchSet.createMany({
    data: randomMatchSets(winnerSide).map((set) => ({
      matchId: match.id,
      ...set
    }))
  });
  return winner;
}

async function createCategoryDraw({ season, competition, category, ranking, offsetHours }) {
  const competitionCategory = await prisma.competitionCategory.create({
    data: {
      competitionId: competition.id,
      categoryId: category.id,
      displayName: category.name,
      format: "knockout"
    }
  });
  const participants = await playersForCategory(category, ranking, season);
  const seededPositions = [0, 7, 3, 4, 1, 6, 2, 5];
  const draw = [];

  for (let index = 0; index < participants.length; index += 1) {
    draw[seededPositions[index]] = participants[index];
  }

  for (const [index, player] of draw.entries()) {
    const seedNumber = index === 0 ? 1 : index === 7 ? 2 : index === 3 ? 3 : index === 4 ? 4 : null;
    await prisma.competitionParticipant.create({
      data: {
        competitionId: competition.id,
        competitionCategoryId: competitionCategory.id,
        playerId: player.id,
        seedNumber
      }
    });
    await prisma.tournamentRegistration.create({
      data: {
        competitionCategoryId: competitionCategory.id,
        playerId: player.id,
        playerNameAtRegistration: playerName(player),
        status: "accepted"
      }
    });
    if (seedNumber) {
      await prisma.tournamentSeed.create({
        data: {
          competitionCategoryId: competitionCategory.id,
          playerId: player.id,
          playerNameAtTime: playerName(player),
          seedNumber,
          suggested: true
        }
      });
    }
    await prisma.tournamentDrawEntry.create({
      data: {
        competitionCategoryId: competitionCategory.id,
        bracketType: "main",
        playerId: player.id,
        playerNameAtTime: playerName(player),
        seedNumber,
        bracketPosition: index + 1,
        isBye: false
      }
    });
  }

  const quarterWinners = [];
  for (let index = 0; index < 4; index += 1) {
    quarterWinners.push(await createPlayedMatch({
      season,
      competition,
      competitionCategory,
      roundNumber: 1,
      bracketPosition: index + 1,
      matchType: "tournament_knockout",
      homePlayer: draw[index * 2],
      awayPlayer: draw[index * 2 + 1],
      scheduledAt: addHours(tournamentStart, offsetHours + index)
    }));
  }

  const finalists = [];
  const semifinalLosers = [];
  for (let index = 0; index < 2; index += 1) {
    const homePlayer = quarterWinners[index * 2];
    const awayPlayer = quarterWinners[index * 2 + 1];
    const winner = await createPlayedMatch({
      season,
      competition,
      competitionCategory,
      roundNumber: 2,
      bracketPosition: index + 1,
      matchType: "tournament_knockout",
      homePlayer,
      awayPlayer,
      scheduledAt: addHours(tournamentStart, offsetHours + 6 + index)
    });
    finalists.push(winner);
    semifinalLosers.push(winner.id === homePlayer.id ? awayPlayer : homePlayer);
  }

  await createPlayedMatch({
    season,
    competition,
    competitionCategory,
    roundNumber: 3,
    bracketPosition: 1,
    matchType: "tournament_knockout",
    homePlayer: finalists[0],
    awayPlayer: finalists[1],
    scheduledAt: addHours(tournamentStart, offsetHours + 12)
  });

  await createPlayedMatch({
    season,
    competition,
    competitionCategory,
    roundNumber: 3,
    bracketPosition: 2,
    matchType: "tournament_third_place",
    homePlayer: semifinalLosers[0],
    awayPlayer: semifinalLosers[1],
    scheduledAt: addHours(tournamentStart, offsetHours + 11)
  });

  return { categoryName: category.name, participants: participants.length };
}

async function main() {
  const [season, ranking, categories, hostClub] = await Promise.all([
    getSeason(),
    getRanking(),
    prisma.category.findMany({ where: { name: { in: categoryNames } } }),
    prisma.club.findFirst({ orderBy: [{ name: "asc" }] })
  ]);

  if (!season) throw new Error("No season found.");
  if (!hostClub) throw new Error("No club found to host the demo tournament.");

  for (const categoryName of categoryNames) {
    if (!categories.some((category) => category.name === categoryName)) {
      throw new Error(`Category not found: ${categoryName}`);
    }
  }

  await prisma.competition.deleteMany({
    where: {
      type: "tournament",
      name: tournamentName,
      startsAt: tournamentStart
    }
  });

  const competition = await prisma.competition.create({
    data: {
      seasonId: season.id,
      type: "tournament",
      status: "closed",
      name: tournamentName,
      description: "Torneig demo amb resultats aleatoris per validar l'evolucio del ranquing.",
      bestOfSets: 5,
      refereeName: "Demo SquashFlow",
      rankingScope: "autonomic",
      rankingCode: "CAT",
      rankingId: ranking.id,
      registrationDeadline: new Date("2026-05-10T23:00:00.000Z"),
      startsAt: tournamentStart,
      endsAt: tournamentEnd,
      hostClubId: hostClub.id
    }
  });

  const summaries = [];
  for (const [index, categoryName] of categoryNames.entries()) {
    const category = categories.find((item) => item.name === categoryName);
    summaries.push(await createCategoryDraw({
      season,
      competition,
      category,
      ranking,
      offsetHours: index * 24
    }));
  }

  console.log(`Created and closed tournament ${competition.id} (${competition.name}).`);
  for (const summary of summaries) {
    console.log(`${summary.categoryName}: ${summary.participants} participants, 7 matches plus third-place match.`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
