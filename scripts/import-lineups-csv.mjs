import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const defaultCsvPath = "/Users/ivan.molera/Downloads/alineaciones_esquaix.csv";
const csvPath = process.argv.find((arg) => arg.endsWith(".csv")) ?? defaultCsvPath;
const shouldExecute = process.argv.includes("--execute");
const seasonName = "2025/26";

const categoryByCsvName = new Map([
  ["1ª CATEGORIA", "Primera"],
  ["2ª CATEGORIA", "Segunda"],
  ["3ª CATEGORIA", "Tercera"],
  ["4ª CATEGORIA", "Open"],
  ["5ª CATEGORIA", "Open"],
  ["6ª CATEGORIA", "Open"],
  ["VETERANS", "Masc +35"]
]);

const clubAliases = new Map([
  ["tipi park sports", "Tipi Park"],
  ["club tennis sabadell", "CT Sabadell"],
  ["melich sportsclub", "Can Mèlich"],
  ["melich sports club", "Can Mèlich"],
  ["esquaix marconi", "Esquaix Marconi"],
  ["club natacio sant andreu", "CN Sant Andreu"],
  ["club natacio sabadell", "CN Sabadell"],
  ["geieg", "GEIEG"],
  ["bonasport", "Bonasport"],
  ["saf uab", "SAF UAB"],
  ["club natacio barcelona", "CN Barcelona"],
  ["ceac", "CEAC Castellet"],
  ["dir rocafort", "DIR Rocafort"],
  ["esquaix tarragona", "Esquaix Tarragona"],
  ["can busque", "Can Busqué"],
  ["c.e. mediterrani", "CE Mediterrani"],
  ["ce mediterrani", "CE Mediterrani"]
]);

const clubsToCreate = new Map([
  ["DIR Rocafort", { city: "Barcelona", province: "Barcelona" }],
  ["Esquaix Tarragona", { city: "Tarragona", province: "Tarragona" }]
]);

function normalize(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[“”"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(value) {
  return value
    .toLocaleLowerCase("ca")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toLocaleUpperCase("ca") + word.slice(1))
    .join(" ");
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

function readCsv(filePath) {
  const content = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  const headers = parseCsvLine(lines.shift()).map((header) => header.trim());

  return lines.map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""]));
  });
}

function baseTeamName(teamName) {
  return teamName.replace(/\s+"?[BCD]"?$/i, "").trim();
}

function teamSuffix(teamName) {
  const match = teamName.match(/\s+"?([BCD])"?$/i);
  return match ? ` ${match[1].toUpperCase()}` : "";
}

function splitPlayerName(fullName) {
  const words = titleCase(fullName).split(" ").filter(Boolean);
  if (words.length === 1) return { firstName: words[0], lastName: words[0] };
  return { firstName: words[0], lastName: words.slice(1).join(" ") };
}

async function getSeason() {
  return prisma.season.upsert({
    where: { name: seasonName },
    update: { status: "active" },
    create: {
      name: seasonName,
      startsAt: new Date("2025-09-01"),
      endsAt: new Date("2026-06-30"),
      status: "active"
    }
  });
}

async function getCategories() {
  const categories = await prisma.category.findMany();
  const byName = new Map(categories.map((category) => [category.name, category]));
  const required = [...new Set(categoryByCsvName.values())];
  const missing = required.filter((name) => !byName.has(name));

  if (missing.length) {
    throw new Error(`Faltan categorías oficiales en la base de datos: ${missing.join(", ")}`);
  }

  return byName;
}

async function getClubByTeamName(teamName, clubsByName) {
  const aliasKey = normalize(baseTeamName(teamName));
  const clubName = clubAliases.get(aliasKey);

  if (!clubName) {
    throw new Error(`No hay alias de club para el equipo "${teamName}"`);
  }

  const existing = clubsByName.get(normalize(clubName));
  if (existing) return existing;

  const createData = clubsToCreate.get(clubName);
  if (!createData) {
    throw new Error(`El club "${clubName}" no existe y no hay datos para crearlo.`);
  }

  const club = await prisma.club.create({
    data: {
      name: clubName,
      city: createData.city,
      province: createData.province,
      address: null,
      postalCode: null,
      availableCourts: 0,
      showContactPublic: true
    }
  });
  clubsByName.set(normalize(club.name), club);
  return club;
}

async function resetCompetitionData() {
  await prisma.matchSet.deleteMany();
  await prisma.match.deleteMany();
  await prisma.teamTie.deleteMany();
  await prisma.individualRankingSnapshot.deleteMany();
  await prisma.teamRankingSnapshot.deleteMany();
  await prisma.tournamentRegistration.deleteMany();
  await prisma.tournamentSeed.deleteMany();
  await prisma.tournamentDrawEntry.deleteMany();
  await prisma.competitionParticipant.deleteMany();
  await prisma.competitionCategory.deleteMany();
  await prisma.competition.deleteMany();
  await prisma.teamRoster.deleteMany();
  await prisma.team.deleteMany();
  await prisma.clubJoinRequest.deleteMany();
  await prisma.playerClubMembership.deleteMany();
  await prisma.player.deleteMany();
}

async function importLineups(rows) {
  const season = await getSeason();
  const categories = await getCategories();
  const clubs = await prisma.club.findMany();
  const clubsByName = new Map(clubs.map((club) => [normalize(club.name), club]));
  const playersByName = new Map();
  const memberships = new Set();
  const groupedTeams = new Map();

  for (const row of rows) {
    const categoryName = categoryByCsvName.get(row.categoria);
    if (!categoryName) throw new Error(`Categoría CSV no reconocida: ${row.categoria}`);
    const key = `${row.categoria}::${row.equipo}`;
    const list = groupedTeams.get(key) ?? [];
    list.push(row);
    groupedTeams.set(key, list);
  }

  for (const rowsForTeam of groupedTeams.values()) {
    const first = rowsForTeam[0];
    const categoryName = categoryByCsvName.get(first.categoria);
    const category = categories.get(categoryName);
    const club = await getClubByTeamName(first.equipo, clubsByName);
    const suffix = teamSuffix(first.equipo);
    const teamName = `${club.name}${suffix}`;

    const team = await prisma.team.create({
      data: {
        clubId: club.id,
        seasonId: season.id,
        categoryId: category.id,
        name: teamName,
        clubNameAtCreation: club.name,
        showRosterPublic: true
      }
    });

    for (const row of rowsForTeam.sort((left, right) => Number(left.orden) - Number(right.orden))) {
      const playerKey = normalize(row.jugador);
      let player = playersByName.get(playerKey);

      if (!player) {
        const { firstName, lastName } = splitPlayerName(row.jugador);
        player = await prisma.player.create({
          data: {
            firstName,
            lastName,
            gender: "not_specified",
            dominantHand: "not_specified",
            genericProfileVariant: "neutral",
            showContactPublic: true,
            showPhysicalPublic: true
          }
        });
        playersByName.set(playerKey, player);
      }

      const membershipKey = `${player.id}:${club.id}:${season.id}`;
      if (!memberships.has(membershipKey)) {
        await prisma.playerClubMembership.create({
          data: {
            playerId: player.id,
            clubId: club.id,
            seasonId: season.id,
            clubNameAtThatTime: club.name,
            fromDate: season.startsAt
          }
        });
        memberships.add(membershipKey);
      }

      await prisma.teamRoster.create({
        data: {
          teamId: team.id,
          playerId: player.id,
          seasonId: season.id,
          categoryId: category.id,
          teamNameAtThatTime: team.name,
          clubNameAtThatTime: club.name,
          playerNameAtThatTime: `${player.lastName}, ${player.firstName}`,
          rosterOrder: Number(row.orden),
          fromDate: season.startsAt
        }
      });
    }
  }

  return {
    teams: groupedTeams.size,
    players: playersByName.size,
    memberships: memberships.size
  };
}

async function main() {
  const resolvedPath = path.resolve(csvPath);
  const rows = readCsv(resolvedPath);

  console.log(`CSV: ${resolvedPath}`);
  console.log(`Filas: ${rows.length}`);
  console.log(`Modo: ${shouldExecute ? "EXECUTE" : "DRY RUN"}`);

  if (!shouldExecute) {
    const teamCount = new Set(rows.map((row) => `${row.categoria}::${row.equipo}`)).size;
    const playerCount = new Set(rows.map((row) => normalize(row.jugador))).size;
    console.log(`Equipos a importar: ${teamCount}`);
    console.log(`Jugadores únicos a importar: ${playerCount}`);
    console.log("Vuelve a ejecutar con --execute para aplicar cambios.");
    return;
  }

  await resetCompetitionData();
  const result = await importLineups(rows);
  console.log(`Importados ${result.players} jugadores, ${result.teams} equipos y ${result.memberships} afiliaciones a club.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
