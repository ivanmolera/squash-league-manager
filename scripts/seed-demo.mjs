import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const password = "TestUser1234";
const passwordHash = await bcrypt.hash(password, 12);

const INDIVIDUAL_LEAGUE_NAME = "Liga Individual Demo 2025/2026";
const TEAM_LEAGUE_NAME = "Liga por Equipos Demo 2025/2026";
const SEASON_NAME = "2025/26";
const SEASON_START = new Date("2025-09-01T00:00:00.000Z");
const SEASON_END = new Date("2026-06-30T00:00:00.000Z");
const LEAGUE_START = new Date("2025-09-15T19:00:00.000Z");

const clubNames = [
  "Club Tramuntana Squash",
  "Roc Verd Squash",
  "Diagonal Court Club",
  "Mar Blau Squash",
  "Valles Racket House",
  "Montclar Squash Team",
  "Eixample Glass Court",
  "Llevant Squash Academy"
];

const femaleNames = [
  "Aina", "Berta", "Clara", "Duna", "Elena", "Gina", "Irene", "Laia",
  "Marta", "Nadia", "Ona", "Paula", "Rita", "Sara", "Tania", "Vera",
  "Yasmina", "Noa", "Julia", "Carla", "Emma", "Nerea", "Marina", "Sofia",
  "Ariadna", "Lidia", "Mireia", "Nuria", "Olivia", "Abril", "Celia", "Eva"
];

const maleNames = [
  "Adria", "Arnau", "Biel", "Bruno", "Dani", "Eric", "Ferran", "Hugo",
  "Jan", "Leo", "Marc", "Nil", "Oriol", "Pau", "Pol", "Quim",
  "Sergi", "Unai", "Xavi", "Zoel", "Alex", "Iker", "Joel", "Lucas",
  "Marti", "Nico", "Oscar", "Raul", "Tomas", "Victor", "Guillem", "Roc"
];

const firstSurnames = [
  "Serra", "Puig", "Vidal", "Costa", "Ribas", "Soler", "Marti", "Ferrer",
  "Pons", "Roca", "Mas", "Duran", "Bosch", "Marin", "Gil", "Mora",
  "Castells", "Navarro", "Lopez", "Garcia", "Sanchez", "Torres", "Camps", "Vila",
  "Ortega", "Pastor", "Romero", "Blanco", "Molina", "Aguilar", "Carrasco", "Herrera"
];

const secondSurnames = [
  "Prat", "Oliver", "Casas", "Reig", "Font", "Guasch", "Esteve", "Comas",
  "Vives", "Santos", "Leon", "Calvo", "Sanz", "Domingo", "Iglesias", "Fuster",
  "Pardo", "Mendez", "Soto", "Suarez", "Cabrera", "Nieto", "Cano", "Vega",
  "Riera", "Beltran", "Campos", "Fuentes", "Moya", "Serrano", "Serrat", "Soler"
];

const rackets = ["Tecnifibre", "Dunlop", "Head", "Karakal", "Prince", "Oliver", "Unsquashable", "Eye"];
const provinces = ["Barcelona", "Girona", "Tarragona", "Lleida"];
const cities = ["Barcelona", "Girona", "Tarragona", "Lleida", "Sabadell", "Mataro", "Reus", "Figueres"];

const categoryDefinitions = [
  { key: "male_first", name: "Masculino Primera", genderScope: "male", minAge: null, maxAge: null, sortOrder: 1 },
  { key: "male_second", name: "Masculino Segunda", genderScope: "male", minAge: null, maxAge: null, sortOrder: 2 },
  { key: "male_third", name: "Masculino Tercera", genderScope: "male", minAge: null, maxAge: null, sortOrder: 3 },
  { key: "female", name: "Femenina", genderScope: "female", minAge: null, maxAge: null, sortOrder: 4 },
  { key: "veterans", name: "Veteranos +35", genderScope: "not_specified", minAge: 35, maxAge: null, sortOrder: 5 },
  { key: "junior", name: "Juvenil Sub-18", genderScope: "not_specified", minAge: null, maxAge: 18, sortOrder: 6 }
];

function pick(items, index) {
  return items[index % items.length];
}

function addDays(date, days) {
  const output = new Date(date);
  output.setUTCDate(output.getUTCDate() + days);
  return output;
}

function ageAt(dateOfBirth, atDate = LEAGUE_START) {
  let age = atDate.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const monthDiff = atDate.getUTCMonth() - dateOfBirth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && atDate.getUTCDate() < dateOfBirth.getUTCDate())) {
    age -= 1;
  }
  return age;
}

function deterministicShuffle(items, salt) {
  return [...items].sort((left, right) => {
    const leftKey = `${salt}:${left.id ?? left.name}`;
    const rightKey = `${salt}:${right.id ?? right.name}`;
    return hashString(leftKey) - hashString(rightKey);
  });
}

function hashString(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 1000003;
  }
  return hash;
}

function generateRoundRobin(items) {
  const competitors = [...items];
  if (competitors.length % 2 === 1) {
    competitors.push(null);
  }

  const rounds = [];
  const roundCount = competitors.length - 1;
  const matchesPerRound = competitors.length / 2;

  for (let round = 0; round < roundCount; round += 1) {
    const matches = [];
    for (let match = 0; match < matchesPerRound; match += 1) {
      const home = competitors[match];
      const away = competitors[competitors.length - 1 - match];
      if (home && away) {
        matches.push(round % 2 === 0 ? [home, away] : [away, home]);
      }
    }
    rounds.push(matches);
    competitors.splice(1, 0, competitors.pop() ?? null);
  }

  return rounds;
}

function generateDoubleRoundRobin(items) {
  const firstLeg = generateRoundRobin(items);
  const secondLeg = firstLeg.map((round) => round.map(([home, away]) => [away, home]));
  return [...firstLeg, ...secondLeg];
}

function matchSetScores(matchIndex, homeWins) {
  const losingSets = matchIndex % 3;
  const sets = [];
  let homeSets = 0;
  let awaySets = 0;
  const totalSets = 3 + losingSets;

  for (let setIndex = 0; setIndex < totalSets; setIndex += 1) {
    const forceLoserSet = setIndex < losingSets && setIndex % 2 === 1;
    const setWinnerIsHome = forceLoserSet ? !homeWins : homeWins;
    const loserPoints = 5 + ((matchIndex + setIndex) % 6);
    const winnerPoints = loserPoints >= 10 ? loserPoints + 2 : 11;

    if (setWinnerIsHome) {
      homeSets += 1;
      sets.push({ setNumber: setIndex + 1, homePoints: winnerPoints, awayPoints: loserPoints });
    } else {
      awaySets += 1;
      sets.push({ setNumber: setIndex + 1, homePoints: loserPoints, awayPoints: winnerPoints });
    }

    if (homeSets === 3 || awaySets === 3) {
      break;
    }
  }

  return { sets, homeSets, awaySets };
}

function emptyPlayerStats(player, clubId) {
  return {
    player,
    clubId,
    matchesWon: 0,
    matchesLost: 0,
    setsFor: 0,
    setsAgainst: 0,
    pointsFor: 0,
    pointsAgainst: 0
  };
}

async function getSeason() {
  return prisma.season.upsert({
    where: { name: SEASON_NAME },
    update: {
      startsAt: SEASON_START,
      endsAt: SEASON_END,
      status: "active"
    },
    create: {
      name: SEASON_NAME,
      startsAt: SEASON_START,
      endsAt: SEASON_END,
      status: "active"
    }
  });
}

async function getCategory(definition) {
  const found = await prisma.category.findFirst({
    where: {
      name: definition.name,
      genderScope: definition.genderScope,
      minAge: definition.minAge,
      maxAge: definition.maxAge
    }
  });

  if (found) {
    return prisma.category.update({
      where: { id: found.id },
      data: { sortOrder: definition.sortOrder }
    });
  }

  return prisma.category.create({
    data: {
      name: definition.name,
      genderScope: definition.genderScope,
      minAge: definition.minAge,
      maxAge: definition.maxAge,
      sortOrder: definition.sortOrder
    }
  });
}

async function upsertUser({ email, displayName, phone, locale = "es" }) {
  const user = await prisma.user.upsert({
    where: { email },
    update: { displayName, phone, emailVerified: true, preferredLocale: locale },
    create: {
      firebaseUid: `local:${email}`,
      email,
      displayName,
      phone,
      emailVerified: true,
      preferredLocale: locale
    }
  });

  await prisma.authCredential.upsert({
    where: { userId: user.id },
    update: { passwordHash, passwordChangedAt: new Date() },
    create: { userId: user.id, passwordHash }
  });

  await prisma.userRoleAssignment.upsert({
    where: { userId_role: { userId: user.id, role: "player" } },
    update: {},
    create: { userId: user.id, role: "player" }
  });

  return user;
}

async function resetDemoData() {
  await prisma.competition.deleteMany({
    where: { name: { in: [INDIVIDUAL_LEAGUE_NAME, TEAM_LEAGUE_NAME] } }
  });

  const clubs = await prisma.club.findMany({
    where: { name: { in: clubNames } },
    select: { id: true }
  });
  const clubIds = clubs.map((club) => club.id);

  if (clubIds.length > 0) {
    const teams = await prisma.team.findMany({
      where: { clubId: { in: clubIds } },
      select: { id: true }
    });
    const teamIds = teams.map((team) => team.id);

    if (teamIds.length > 0) {
      await prisma.teamRankingSnapshot.deleteMany({ where: { teamId: { in: teamIds } } });
      await prisma.teamRoster.deleteMany({ where: { teamId: { in: teamIds } } });
      await prisma.team.deleteMany({ where: { id: { in: teamIds } } });
    }

    await prisma.playerClubMembership.deleteMany({ where: { clubId: { in: clubIds } } });
  }

  const demoUsers = await prisma.user.findMany({
    where: { email: { endsWith: "@demo.squash.local" } },
    select: { id: true }
  });
  const demoUserIds = demoUsers.map((user) => user.id);

  if (demoUserIds.length > 0) {
    const demoPlayers = await prisma.player.findMany({
      where: { userId: { in: demoUserIds } },
      select: { id: true }
    });
    const demoPlayerIds = demoPlayers.map((player) => player.id);

    if (demoPlayerIds.length > 0) {
      await prisma.individualRankingSnapshot.deleteMany({ where: { playerId: { in: demoPlayerIds } } });
      await prisma.player.deleteMany({ where: { id: { in: demoPlayerIds } } });
    }
  }

  if (clubIds.length > 0) {
    await prisma.club.deleteMany({ where: { id: { in: clubIds } } });
  }

  if (demoUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: demoUserIds } } });
  }
}

function buildPlayerProfile(clubIndex, playerIndex) {
  const globalIndex = clubIndex * 24 + playerIndex;
  const isFemale = playerIndex % 2 === 1;
  const firstName = isFemale ? pick(femaleNames, globalIndex) : pick(maleNames, globalIndex);
  const firstSurname = pick(firstSurnames, globalIndex + clubIndex * 3);
  const secondSurname = pick(secondSurnames, globalIndex * 2 + playerIndex);
  const lastName = `${firstSurname} ${secondSurname}`;
  const birthYear = playerIndex < 5
    ? 1974 + ((globalIndex + playerIndex) % 15)
    : playerIndex < 10
      ? 2008 + ((globalIndex + playerIndex) % 2)
      : 1992 + ((globalIndex + playerIndex) % 14);
  const birthMonth = (globalIndex % 12) + 1;
  const birthDay = (globalIndex % 24) + 1;

  return {
    firstName,
    lastName,
    gender: isFemale ? "female" : "male",
    email: `${firstName}.${firstSurname}.${secondSurname}.${globalIndex}@demo.squash.local`.toLowerCase(),
    phone: `+34 6${String(10 + clubIndex).padStart(2, "0")} ${String(200 + playerIndex).padStart(3, "0")} ${String(100 + globalIndex).padStart(3, "0")}`,
    birthDate: new Date(`${birthYear}-${String(birthMonth).padStart(2, "0")}-${String(birthDay).padStart(2, "0")}T00:00:00.000Z`),
    dominantHand: playerIndex % 6 === 0 ? "left" : playerIndex % 11 === 0 ? "ambidextrous" : "right",
    heightCm: isFemale ? 158 + (globalIndex % 25) : 168 + (globalIndex % 29),
    weightKg: isFemale ? 52 + (globalIndex % 24) : 64 + (globalIndex % 31),
    racketBrand: pick(rackets, globalIndex),
    locale: pick(["ca", "es", "en"], globalIndex)
  };
}

async function createDemoClubsAndPlayers(season, categoriesByKey) {
  const allPlayers = [];
  const clubs = [];

  for (const [clubIndex, clubName] of clubNames.entries()) {
    const managerProfile = buildPlayerProfile(clubIndex, 0);
    const manager = await upsertUser({
      email: `manager.${clubIndex + 1}@demo.squash.local`,
      displayName: `${managerProfile.firstName} ${managerProfile.lastName}`,
      phone: `+34 650 10 ${String(clubIndex + 1).padStart(2, "0")} 00`,
      locale: managerProfile.locale
    });

    await prisma.userRoleAssignment.upsert({
      where: { userId_role: { userId: manager.id, role: "manager" } },
      update: {},
      create: { userId: manager.id, role: "manager" }
    });

    const club = await prisma.club.create({
      data: {
        name: clubName,
        city: pick(cities, clubIndex),
        province: pick(provinces, clubIndex),
        address: `Carrer Central ${clubIndex + 10}`,
        websiteUrl: `https://demo-${clubIndex + 1}.squash.local`,
        managerUserId: manager.id,
        showContactPublic: true
      }
    });
    clubs.push(club);

    await prisma.$executeRaw`
      INSERT INTO club_season_profiles (club_id, season_id, display_name)
      VALUES (${club.id}::uuid, ${season.id}::uuid, ${club.name})
      ON CONFLICT (club_id, season_id)
      DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = now()
    `;

    const clubPlayers = [];
    for (let playerIndex = 0; playerIndex < 24; playerIndex += 1) {
      const profile = buildPlayerProfile(clubIndex, playerIndex);
      const user = playerIndex === 0
        ? manager
        : await upsertUser({
            email: profile.email,
            displayName: `${profile.firstName} ${profile.lastName}`,
            phone: profile.phone,
            locale: profile.locale
          });

      const player = await prisma.player.create({
        data: {
          userId: user.id,
          firstName: profile.firstName,
          lastName: profile.lastName,
          gender: profile.gender,
          birthDate: profile.birthDate,
          dominantHand: profile.dominantHand,
          heightCm: profile.heightCm,
          weightKg: profile.weightKg,
          racketBrand: profile.racketBrand,
          showContactPublic: true,
          showPhysicalPublic: playerIndex % 5 !== 0
        }
      });

      await prisma.playerClubMembership.create({
        data: {
          playerId: player.id,
          clubId: club.id,
          seasonId: season.id,
          clubNameAtThatTime: club.name,
          fromDate: season.startsAt
        }
      });

      const enriched = { ...player, clubId: club.id, clubName: club.name };
      allPlayers.push(enriched);
      clubPlayers.push(enriched);
    }

    await createClubTeamsForAllCategories({ club, clubPlayers, season, categoriesByKey });
  }

  return { clubs, allPlayers };
}

function eligiblePlayersForCategory(players, categoryKey) {
  if (categoryKey.startsWith("male_")) {
    return players.filter((player) => player.gender === "male");
  }
  if (categoryKey === "female") {
    return players.filter((player) => player.gender === "female");
  }
  if (categoryKey === "veterans") {
    return players.filter((player) => player.birthDate && ageAt(player.birthDate) >= 35);
  }
  if (categoryKey === "junior") {
    return players.filter((player) => player.birthDate && ageAt(player.birthDate) <= 18);
  }
  return players;
}

function teamRosterForCategory(players, categoryKey) {
  const eligible = eligiblePlayersForCategory(players, categoryKey)
    .sort((left, right) => left.lastName.localeCompare(right.lastName, "es") || left.firstName.localeCompare(right.firstName, "es"));

  if (categoryKey === "male_first") return eligible.slice(0, 4);
  if (categoryKey === "male_second") return eligible.slice(4, 8);
  if (categoryKey === "male_third") return eligible.slice(8, 12);
  return eligible.slice(0, 4);
}

async function createClubTeamsForAllCategories({ club, clubPlayers, season, categoriesByKey }) {
  for (const definition of categoryDefinitions) {
    const category = categoriesByKey[definition.key];
    const rosterPlayers = teamRosterForCategory(clubPlayers, definition.key);

    if (rosterPlayers.length < 4) {
      continue;
    }

    const team = await prisma.team.create({
      data: {
        clubId: club.id,
        seasonId: season.id,
        categoryId: category.id,
        name: `${club.name} ${category.name}`,
        clubNameAtCreation: club.name,
        showRosterPublic: true
      }
    });

    for (const player of rosterPlayers) {
      await prisma.teamRoster.create({
        data: {
          teamId: team.id,
          playerId: player.id,
          seasonId: season.id,
          categoryId: category.id,
          teamNameAtThatTime: team.name,
          clubNameAtThatTime: club.name,
          playerNameAtThatTime: `${player.lastName}, ${player.firstName}`,
          fromDate: season.startsAt
        }
      });
    }
  }
}

function selectIndividualParticipants(allPlayers) {
  const selection = {};
  const malePlayers = deterministicShuffle(allPlayers.filter((player) => player.gender === "male"), "male");
  const femalePlayers = deterministicShuffle(allPlayers.filter((player) => player.gender === "female"), "female");
  const veteranPlayers = deterministicShuffle(allPlayers.filter((player) => player.birthDate && ageAt(player.birthDate) >= 35), "veterans");
  const juniorPlayers = deterministicShuffle(allPlayers.filter((player) => player.birthDate && ageAt(player.birthDate) <= 18), "junior");

  selection.male_first = malePlayers.slice(0, 8);
  selection.male_second = malePlayers.slice(8, 16);
  selection.male_third = malePlayers.slice(16, 24);
  selection.female = femalePlayers.slice(0, 8);
  selection.veterans = veteranPlayers.slice(0, 8);
  selection.junior = juniorPlayers.slice(0, 8);

  return selection;
}

async function createIndividualLeague({ season, categoriesByKey, allPlayers }) {
  const competition = await prisma.competition.create({
    data: {
      seasonId: season.id,
      type: "individual_league",
      status: "active",
      name: INDIVIDUAL_LEAGUE_NAME,
      description: "Liga individual demo con categorias, calendario ida/vuelta y resultados de prueba.",
      registrationDeadline: new Date("2025-09-01T22:00:00.000Z"),
      startsAt: LEAGUE_START,
      endsAt: new Date("2026-04-15T22:00:00.000Z")
    }
  });

  const participantsByCategory = selectIndividualParticipants(allPlayers);

  for (const definition of categoryDefinitions) {
    const category = categoriesByKey[definition.key];
    const players = participantsByCategory[definition.key];
    const competitionCategory = await prisma.competitionCategory.create({
      data: {
        competitionId: competition.id,
        categoryId: category.id,
        format: "league"
      }
    });

    await prisma.competitionParticipant.createMany({
      data: players.map((player) => ({
        competitionId: competition.id,
        competitionCategoryId: competitionCategory.id,
        playerId: player.id
      }))
    });

    const playerStats = new Map(players.map((player) => [player.id, emptyPlayerStats(player, player.clubId)]));
    const rounds = generateDoubleRoundRobin(players);
    let matchIndex = 0;

    for (const [roundIndex, round] of rounds.entries()) {
      const scheduledAt = addDays(LEAGUE_START, roundIndex * 14);
      for (const [home, away] of round) {
        const homeWins = (matchIndex + roundIndex) % 2 === 0;
        const { sets, homeSets, awaySets } = matchSetScores(matchIndex, homeWins);
        await createPlayedMatch({
          season,
          competition,
          competitionCategory,
          matchType: "individual_league",
          roundNumber: roundIndex + 1,
          matchOrder: (matchIndex % 4) + 1,
          scheduledAt,
          home,
          away,
          homeClubId: home.clubId,
          awayClubId: away.clubId,
          homeClubName: home.clubName,
          awayClubName: away.clubName,
          homeSets,
          awaySets,
          sets,
          playerStats
        });
        matchIndex += 1;
      }
    }

    await createIndividualRankingSnapshots({ season, competition, competitionCategory, stats: playerStats });
  }
}

async function createPlayedMatch({
  season,
  competition,
  competitionCategory,
  matchType,
  roundNumber,
  matchOrder,
  scheduledAt,
  home,
  away,
  homeClubId,
  awayClubId,
  homeClubName,
  awayClubName,
  homeTeam,
  awayTeam,
  teamTie,
  homeSets,
  awaySets,
  sets,
  playerStats
}) {
  const homeWins = homeSets > awaySets;
  await prisma.match.create({
    data: {
      seasonId: season.id,
      competitionId: competition.id,
      competitionCategoryId: competitionCategory.id,
      teamTieId: teamTie?.id,
      matchType,
      status: "played",
      roundNumber,
      matchOrder,
      scheduledAt,
      playedAt: addDays(scheduledAt, 1),
      homePlayerId: home.id,
      awayPlayerId: away.id,
      winnerPlayerId: homeWins ? home.id : away.id,
      homeClubIdAtMatchTime: homeClubId,
      awayClubIdAtMatchTime: awayClubId,
      homeTeamIdAtMatchTime: homeTeam?.id,
      awayTeamIdAtMatchTime: awayTeam?.id,
      homePlayerNameAtMatchTime: `${home.firstName} ${home.lastName}`,
      awayPlayerNameAtMatchTime: `${away.firstName} ${away.lastName}`,
      homeClubNameAtMatchTime: homeClubName,
      awayClubNameAtMatchTime: awayClubName,
      homeTeamNameAtMatchTime: homeTeam?.name,
      awayTeamNameAtMatchTime: awayTeam?.name,
      sets: { createMany: { data: sets } }
    }
  });

  if (playerStats) {
    updatePlayerStats(playerStats, home, away, homeSets, awaySets, sets);
  }
}

function updatePlayerStats(playerStats, home, away, homeSets, awaySets, sets) {
  const homeStats = playerStats.get(home.id);
  const awayStats = playerStats.get(away.id);
  if (!homeStats || !awayStats) return;

  homeStats.matchesWon += homeSets > awaySets ? 1 : 0;
  homeStats.matchesLost += homeSets > awaySets ? 0 : 1;
  awayStats.matchesWon += awaySets > homeSets ? 1 : 0;
  awayStats.matchesLost += awaySets > homeSets ? 0 : 1;
  homeStats.setsFor += homeSets;
  homeStats.setsAgainst += awaySets;
  awayStats.setsFor += awaySets;
  awayStats.setsAgainst += homeSets;

  for (const set of sets) {
    homeStats.pointsFor += set.homePoints;
    homeStats.pointsAgainst += set.awayPoints;
    awayStats.pointsFor += set.awayPoints;
    awayStats.pointsAgainst += set.homePoints;
  }
}

async function createIndividualRankingSnapshots({ season, competition, competitionCategory, stats }) {
  const rows = [...stats.values()].sort((left, right) =>
    right.matchesWon - left.matchesWon ||
    (right.setsFor - right.setsAgainst) - (left.setsFor - left.setsAgainst) ||
    (right.pointsFor - right.pointsAgainst) - (left.pointsFor - left.pointsAgainst) ||
    left.player.lastName.localeCompare(right.player.lastName, "es")
  );

  await prisma.individualRankingSnapshot.createMany({
    data: rows.map((row, index) => ({
      seasonId: season.id,
      competitionId: competition.id,
      competitionCategoryId: competitionCategory.id,
      playerId: row.player.id,
      clubIdAtThatTime: row.clubId,
      playerNameAtThatTime: `${row.player.firstName} ${row.player.lastName}`,
      clubNameAtThatTime: row.player.clubName,
      position: index + 1,
      matchesWon: row.matchesWon,
      matchesLost: row.matchesLost,
      setsFor: row.setsFor,
      setsAgainst: row.setsAgainst,
      pointsFor: row.pointsFor,
      pointsAgainst: row.pointsAgainst,
      winPercentage: row.matchesWon + row.matchesLost === 0 ? 0 : row.matchesWon / (row.matchesWon + row.matchesLost)
    }))
  });
}

async function createTeamLeague({ season, categoriesByKey, clubs }) {
  const competition = await prisma.competition.create({
    data: {
      seasonId: season.id,
      type: "team_league",
      status: "active",
      name: TEAM_LEAGUE_NAME,
      description: "Liga por equipos demo con confrontaciones a cuatro partidos y resultados individuales.",
      registrationDeadline: new Date("2025-09-01T22:00:00.000Z"),
      startsAt: LEAGUE_START,
      endsAt: new Date("2026-04-15T22:00:00.000Z")
    }
  });

  for (const definition of categoryDefinitions) {
    const category = categoriesByKey[definition.key];
    const teams = await prisma.team.findMany({
      where: {
        seasonId: season.id,
        categoryId: category.id,
        clubId: { in: clubs.map((club) => club.id) }
      },
      include: {
        club: true,
        rosters: {
          include: { player: true },
          orderBy: [{ playerNameAtThatTime: "asc" }]
        }
      },
      orderBy: { name: "asc" },
      take: 6
    });

    const competitionCategory = await prisma.competitionCategory.create({
      data: {
        competitionId: competition.id,
        categoryId: category.id,
        format: "league"
      }
    });

    await prisma.competitionParticipant.createMany({
      data: teams.map((team) => ({
        competitionId: competition.id,
        competitionCategoryId: competitionCategory.id,
        clubId: team.clubId
      }))
    });

    const teamStats = new Map(teams.map((team) => [team.id, {
      team,
      tiesWon: 0,
      tiesDrawn: 0,
      tiesLost: 0,
      rubbersFor: 0,
      rubbersAgainst: 0,
      pointsFor: 0,
      pointsAgainst: 0
    }]));

    const rounds = generateDoubleRoundRobin(teams);
    let tieIndex = 0;

    for (const [roundIndex, round] of rounds.entries()) {
      const scheduledAt = addDays(LEAGUE_START, roundIndex * 14);
      for (const [homeTeam, awayTeam] of round) {
        const teamTie = await prisma.teamTie.create({
          data: {
            seasonId: season.id,
            competitionId: competition.id,
            competitionCategoryId: competitionCategory.id,
            homeTeamId: homeTeam.id,
            awayTeamId: awayTeam.id,
            scheduledAt,
            playedAt: addDays(scheduledAt, 1),
            venueClubId: homeTeam.clubId,
            status: "played",
            homeTeamNameAtTime: homeTeam.name,
            awayTeamNameAtTime: awayTeam.name,
            homeClubNameAtTime: homeTeam.club.name,
            awayClubNameAtTime: awayTeam.club.name
          }
        });

        const rubbers = await createTeamRubbers({
          season,
          competition,
          competitionCategory,
          teamTie,
          homeTeam,
          awayTeam,
          roundNumber: roundIndex + 1,
          scheduledAt,
          tieIndex
        });

        updateTeamStats(teamStats, homeTeam.id, awayTeam.id, rubbers.homeRubbers, rubbers.awayRubbers);
        tieIndex += 1;
      }
    }

    await createTeamRankingSnapshots({ season, competition, competitionCategory, teamStats });
  }
}

async function createTeamRubbers({ season, competition, competitionCategory, teamTie, homeTeam, awayTeam, roundNumber, scheduledAt, tieIndex }) {
  let homeRubbers = 0;
  let awayRubbers = 0;
  const targetHomeRubbers = [4, 3, 2, 1, 0][(tieIndex + roundNumber) % 5];
  const homeWinSlots = new Set([0, 2, 1, 3].slice(0, targetHomeRubbers));

  for (let rubberIndex = 0; rubberIndex < 4; rubberIndex += 1) {
    const homeRoster = homeTeam.rosters[rubberIndex % homeTeam.rosters.length];
    const awayRoster = awayTeam.rosters[rubberIndex % awayTeam.rosters.length];
    const homeWins = homeWinSlots.has(rubberIndex);
    const { sets, homeSets, awaySets } = matchSetScores(tieIndex * 4 + rubberIndex, homeWins);

    if (homeSets > awaySets) homeRubbers += 1;
    else awayRubbers += 1;

    await createPlayedMatch({
      season,
      competition,
      competitionCategory,
      matchType: "team_rubber",
      roundNumber,
      matchOrder: rubberIndex + 1,
      scheduledAt,
      home: homeRoster.player,
      away: awayRoster.player,
      homeClubId: homeTeam.clubId,
      awayClubId: awayTeam.clubId,
      homeClubName: homeTeam.club.name,
      awayClubName: awayTeam.club.name,
      homeTeam,
      awayTeam,
      teamTie,
      homeSets,
      awaySets,
      sets
    });
  }

  return { homeRubbers, awayRubbers };
}

function updateTeamStats(teamStats, homeTeamId, awayTeamId, homeRubbers, awayRubbers) {
  const home = teamStats.get(homeTeamId);
  const away = teamStats.get(awayTeamId);
  if (!home || !away) return;

  home.rubbersFor += homeRubbers;
  home.rubbersAgainst += awayRubbers;
  home.pointsFor += homeRubbers;
  home.pointsAgainst += awayRubbers;
  away.rubbersFor += awayRubbers;
  away.rubbersAgainst += homeRubbers;
  away.pointsFor += awayRubbers;
  away.pointsAgainst += homeRubbers;

  if (homeRubbers > awayRubbers) {
    home.tiesWon += 1;
    away.tiesLost += 1;
  } else if (homeRubbers < awayRubbers) {
    away.tiesWon += 1;
    home.tiesLost += 1;
  } else {
    home.tiesDrawn += 1;
    away.tiesDrawn += 1;
  }
}

async function createTeamRankingSnapshots({ season, competition, competitionCategory, teamStats }) {
  const rows = [...teamStats.values()].sort((left, right) =>
    right.pointsFor - left.pointsFor ||
    (right.rubbersFor - right.rubbersAgainst) - (left.rubbersFor - left.rubbersAgainst) ||
    right.rubbersFor - left.rubbersFor ||
    left.team.name.localeCompare(right.team.name, "es")
  );

  await prisma.teamRankingSnapshot.createMany({
    data: rows.map((row, index) => ({
      seasonId: season.id,
      competitionId: competition.id,
      competitionCategoryId: competitionCategory.id,
      teamId: row.team.id,
      clubId: row.team.clubId,
      teamNameAtThatTime: row.team.name,
      clubNameAtThatTime: row.team.club.name,
      position: index + 1,
      tiesWon: row.tiesWon,
      tiesDrawn: row.tiesDrawn,
      tiesLost: row.tiesLost,
      rubbersFor: row.rubbersFor,
      rubbersAgainst: row.rubbersAgainst,
      pointsFor: row.pointsFor,
      pointsAgainst: row.pointsAgainst
    }))
  });
}

async function main() {
  await resetDemoData();

  const season = await getSeason();
  const categoriesByKey = {};
  for (const definition of categoryDefinitions) {
    categoriesByKey[definition.key] = await getCategory(definition);
  }

  const { clubs, allPlayers } = await createDemoClubsAndPlayers(season, categoriesByKey);
  await createIndividualLeague({ season, categoriesByKey, allPlayers });
  await createTeamLeague({ season, categoriesByKey, clubs });

  console.log(`Seeded ${clubs.length} demo clubs, ${allPlayers.length} players, individual and team leagues for ${SEASON_NAME}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
