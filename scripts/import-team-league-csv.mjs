import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const defaultCsvPath = "/Users/ivan.molera/Downloads/liga_equipos_esquaix_2026.csv";
const csvPath = process.argv.find((arg) => arg.endsWith(".csv")) ?? defaultCsvPath;
const shouldExecute = process.argv.includes("--execute");
const seasonName = "2025/26";
const leagueName = "Liga catalana por equipos 2026";

const categoryByCsvName = new Map([
  ["1ª Categoria", "Primera"],
  ["2ª Categoria", "Segunda"],
  ["3ª Categoria", "Tercera"],
  ["4ª Categoria", "General"],
  ["5ª Categoria", "General"],
  ["6ª Categoria", "General"],
  ["Veterans", "Masc +35"]
]);

const clubAliases = new Map([
  ["bonasport", "Bonasport"],
  ["can busque", "Can Busqué"],
  ["ceac", "CEAC Castellet"],
  ["c.e. mediterrani", "CE Mediterrani"],
  ["ce mediterrani", "CE Mediterrani"],
  ["club natacio barcelona", "CN Barcelona"],
  ["club natacio sabadell", "CN Sabadell"],
  ["club natacio sant andreu", "CN Sant Andreu"],
  ["club tennis sabadell", "CT Sabadell"],
  ["dir rocafort", "DIR Rocafort"],
  ["esquaix marconi", "Esquaix Marconi"],
  ["esquaix tarragona", "Esquaix Tarragona"],
  ["geieg", "GEIEG"],
  ["melich sportsclub", "Can Mèlich"],
  ["melich sports club", "Can Mèlich"],
  ["saf uab", "SAF UAB"],
  ["tipi park sports", "Tipi Park"]
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

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === "\"" && inQuotes && next === "\"") {
      current += "\"";
      index += 1;
    } else if (char === "\"") {
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

function canonicalClubName(teamName) {
  const clubName = clubAliases.get(normalize(baseTeamName(teamName)));
  if (!clubName) {
    throw new Error(`No hay alias de club para el equipo "${teamName}"`);
  }
  return clubName;
}

function roundNumberFromText(value, fallback) {
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : fallback;
}

function parseDate(value, endOfDay = false) {
  const date = new Date(`${value}T${endOfDay ? "22:00:00" : "00:00:00"}.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Fecha CSV no válida: ${value}`);
  }
  return date;
}

async function getSeason() {
  return prisma.season.upsert({
    where: { name: seasonName },
    update: { status: "active" },
    create: {
      name: seasonName,
      startsAt: new Date("2025-09-01"),
      endsAt: new Date("2026-12-31"),
      status: "active"
    }
  });
}

async function getCategories() {
  const categories = await prisma.category.findMany();
  const byName = new Map(categories.map((category) => [category.name, category]));
  const missing = [...new Set(categoryByCsvName.values())].filter((name) => !byName.has(name));

  if (missing.length) {
    throw new Error(`Faltan categorías oficiales en la base de datos: ${missing.join(", ")}`);
  }

  return byName;
}

async function getClubsByName() {
  const clubs = await prisma.club.findMany();
  return new Map(clubs.map((club) => [normalize(club.name), club]));
}

async function getTeam({ teamName, csvCategory, season, category, clubsByName }) {
  const clubName = canonicalClubName(teamName);
  const club = clubsByName.get(normalize(clubName));
  if (!club) {
    throw new Error(`El club "${clubName}" no existe.`);
  }

  const name = `${club.name}${teamSuffix(teamName)}`;

  return prisma.team.upsert({
    where: {
      clubId_seasonId_categoryId_name: {
        clubId: club.id,
        seasonId: season.id,
        categoryId: category.id,
        name
      }
    },
    update: {
      clubNameAtCreation: club.name
    },
    create: {
      clubId: club.id,
      seasonId: season.id,
      categoryId: category.id,
      name,
      clubNameAtCreation: club.name,
      showRosterPublic: true
    }
  });
}

function groupCompetitionRows(rows) {
  const matches = rows.filter((row) => row.tipo === "partido");
  const byCategory = new Map();

  for (const row of matches) {
    const rowsForCategory = byCategory.get(row.categoria) ?? [];
    rowsForCategory.push(row);
    byCategory.set(row.categoria, rowsForCategory);
  }

  return [...byCategory.entries()].sort(([left], [right]) => left.localeCompare(right, "ca"));
}

async function importTeamLeague(rows) {
  const season = await getSeason();
  const categories = await getCategories();
  const clubsByName = await getClubsByName();
  const matchRows = rows.filter((row) => row.tipo === "partido");
  const startsAt = parseDate(matchRows[0].fecha_inicio_jornada);
  const endsAt = parseDate(matchRows[matchRows.length - 1].fecha_fin_jornada, true);

  await prisma.competition.deleteMany({
    where: { seasonId: season.id, type: "team_league", name: leagueName }
  });

  const competition = await prisma.competition.create({
    data: {
      seasonId: season.id,
      type: "team_league",
      status: "active",
      name: leagueName,
      description: "Liga catalana por equipos importada desde el calendario oficial por categorías.",
      bestOfSets: 5,
      registrationDeadline: startsAt,
      startsAt,
      endsAt
    }
  });

  let createdTies = 0;
  let createdParticipants = 0;

  for (const [csvCategory, rowsForCategory] of groupCompetitionRows(rows)) {
    const categoryName = categoryByCsvName.get(csvCategory);
    if (!categoryName) throw new Error(`Categoría CSV no reconocida: ${csvCategory}`);
    const category = categories.get(categoryName);
    const competitionCategory = await prisma.competitionCategory.create({
      data: {
        competitionId: competition.id,
        categoryId: category.id,
        displayName: csvCategory,
        format: "league"
      }
    });

    const teamNames = new Set(rowsForCategory.flatMap((row) => [row.equipo_local, row.equipo_visitante]).filter(Boolean));
    const teams = new Map();
    for (const teamName of teamNames) {
      teams.set(teamName, await getTeam({ teamName, csvCategory, season, category, clubsByName }));
    }

    await prisma.competitionParticipant.createMany({
      data: [...teams.values()].map((team) => ({
        competitionId: competition.id,
        competitionCategoryId: competitionCategory.id,
        clubId: team.clubId
      })),
      skipDuplicates: true
    });
    createdParticipants += teams.size;

    const rowsByRound = new Map();
    for (const row of rowsForCategory) {
      const round = row.jornada;
      const roundRows = rowsByRound.get(round) ?? [];
      roundRows.push(row);
      rowsByRound.set(round, roundRows);
    }

    let fallbackRound = 1;
    for (const [roundText, roundRows] of rowsByRound) {
      const roundNumber = roundNumberFromText(roundText, fallbackRound);
      fallbackRound += 1;
      const firstRoundRow = roundRows[0];
      const matchday = await prisma.leagueMatchday.create({
        data: {
          seasonId: season.id,
          competitionId: competition.id,
          competitionCategoryId: competitionCategory.id,
          roundNumber,
          startsAt: parseDate(firstRoundRow.fecha_inicio_jornada),
          endsAt: parseDate(firstRoundRow.fecha_fin_jornada)
        }
      });

      for (const [matchIndex, row] of roundRows.entries()) {
        const homeTeam = teams.get(row.equipo_local);
        const awayTeam = teams.get(row.equipo_visitante);
        if (!homeTeam || !awayTeam) continue;

        await prisma.teamTie.create({
          data: {
            seasonId: season.id,
            competitionId: competition.id,
            competitionCategoryId: competitionCategory.id,
            leagueMatchdayId: matchday.id,
            scheduledAt: parseDate(row.fecha_inicio_jornada, true),
            homeTeamId: homeTeam.id,
            awayTeamId: awayTeam.id,
            status: "scheduled",
            homeTeamNameAtTime: homeTeam.name,
            awayTeamNameAtTime: awayTeam.name,
            homeClubNameAtTime: homeTeam.clubNameAtCreation,
            awayClubNameAtTime: awayTeam.clubNameAtCreation
          }
        });
        createdTies += 1;
      }
    }
  }

  return {
    competitionId: competition.id,
    categories: groupCompetitionRows(rows).length,
    participants: createdParticipants,
    ties: createdTies,
    skippedRows: rows.filter((row) => row.tipo !== "partido").length
  };
}

async function main() {
  const resolvedPath = path.resolve(csvPath);
  const rows = readCsv(resolvedPath);
  const matchRows = rows.filter((row) => row.tipo === "partido");
  const teams = new Set(matchRows.flatMap((row) => [row.equipo_local, row.equipo_visitante]).filter(Boolean));

  console.log(`CSV: ${resolvedPath}`);
  console.log(`Filas: ${rows.length}`);
  console.log(`Partidos de liga: ${matchRows.length}`);
  console.log(`Equipos únicos: ${teams.size}`);
  console.log(`Modo: ${shouldExecute ? "EXECUTE" : "DRY RUN"}`);

  if (!shouldExecute) {
    console.log("Vuelve a ejecutar con --execute para crear la liga por equipos.");
    return;
  }

  const result = await importTeamLeague(rows);
  console.log(`Liga creada: ${result.competitionId}`);
  console.log(`Importadas ${result.categories} categorías, ${result.participants} participantes y ${result.ties} enfrentamientos.`);
  console.log(`Filas omitidas por no ser enfrentamientos reales: ${result.skippedRows}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
