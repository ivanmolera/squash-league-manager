import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const defaultCsvPath = "/Users/ivan.molera/Downloads/liga_individual_esquaix_partidos.csv";
const csvPath = process.argv.find((arg) => arg.endsWith(".csv")) ?? defaultCsvPath;
const shouldExecute = process.argv.includes("--execute");
const seasonName = "2025/26";
const leagueName = "Liga catalana individual 2026";
const importedYear = 2026;

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
    .map((word) => {
      if (/^[a-z]\.$/i.test(word)) return word.toLocaleUpperCase("ca");
      return word.charAt(0).toLocaleUpperCase("ca") + word.slice(1);
    })
    .join(" ");
}

function splitPlayerName(fullName) {
  const words = titleCase(fullName).split(" ").filter(Boolean);
  if (words.length === 1) return { firstName: words[0], lastName: words[0] };
  return { firstName: words[0], lastName: words.slice(1).join(" ") };
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

function parseCsvDate(value, hour = 20) {
  const [day, month] = value.split("/").map((part) => Number(part));
  if (!day || !month) {
    throw new Error(`Fecha CSV no válida: ${value}`);
  }

  return new Date(Date.UTC(importedYear, month - 1, day, hour, 0, 0));
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

async function getDefaultCategory() {
  const category = await prisma.category.findFirst({
    where: { name: "Open" }
  });

  if (!category) {
    throw new Error("No existe la categoría oficial Open.");
  }

  return category;
}

async function getPlayersByNormalizedName() {
  const players = await prisma.player.findMany({
    include: {
      memberships: {
        include: { club: true },
        orderBy: { fromDate: "desc" }
      }
    }
  });

  return new Map(players.map((player) => [normalize(`${player.firstName} ${player.lastName}`), player]));
}

async function getOrCreatePlayer(rawName, playersByName) {
  const playerKey = normalize(rawName);
  const existing = playersByName.get(playerKey);
  if (existing) return existing;

  const { firstName, lastName } = splitPlayerName(rawName);
  const player = await prisma.player.create({
    data: {
      firstName,
      lastName,
      gender: "not_specified",
      dominantHand: "not_specified",
      genericProfileVariant: "neutral",
      showContactPublic: true,
      showPhysicalPublic: true
    },
    include: {
      memberships: {
        include: { club: true },
        orderBy: { fromDate: "desc" }
      }
    }
  });
  playersByName.set(playerKey, player);
  return player;
}

function currentMembership(player, seasonId) {
  return player.memberships.find((membership) => membership.seasonId === seasonId && membership.toDate === null)
    ?? player.memberships.find((membership) => membership.seasonId === seasonId)
    ?? player.memberships[0]
    ?? null;
}

function groupRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const group = Number(row.grupo);
    const list = groups.get(group) ?? [];
    list.push(row);
    groups.set(group, list);
  }
  return [...groups.entries()].sort(([left], [right]) => left - right);
}

async function importLeague(rows) {
  const season = await getSeason();
  const category = await getDefaultCategory();
  const playersByName = await getPlayersByNormalizedName();
  const playerNames = new Set(rows.flatMap((row) => [row.jugador_local, row.jugador_visitante]).map(normalize));
  const missingPlayers = [...playerNames].filter((name) => !playersByName.has(name));
  const startsAt = parseCsvDate(rows[0].fecha_inicio);
  const endsAt = parseCsvDate(rows[rows.length - 1].fecha_fin, 22);

  await prisma.competition.deleteMany({
    where: { seasonId: season.id, type: "individual_league", name: leagueName }
  });

  const competition = await prisma.competition.create({
    data: {
      seasonId: season.id,
      type: "individual_league",
      status: "active",
      name: leagueName,
      description: "Liga catalana individual importada desde el calendario oficial por grupos.",
      bestOfSets: 5,
      rankingScope: "autonomic",
      rankingCode: "CAT",
      registrationDeadline: parseCsvDate(rows[0].fecha_inicio, 0),
      startsAt,
      endsAt
    }
  });

  let createdParticipants = 0;
  let createdMatches = 0;

  for (const [groupNumber, rowsForGroup] of groupRows(rows)) {
    const competitionCategory = await prisma.competitionCategory.create({
      data: {
        competitionId: competition.id,
        categoryId: category.id,
        displayName: `Grup ${groupNumber}`,
        format: "league"
      }
    });
    const matchdaysByRound = new Map();
    const rounds = [...new Set(rowsForGroup.map((row) => Number(row.jornada)))].sort((left, right) => left - right);

    for (const roundNumber of rounds) {
      const firstRoundRow = rowsForGroup.find((row) => Number(row.jornada) === roundNumber);
      const matchday = await prisma.leagueMatchday.create({
        data: {
          seasonId: season.id,
          competitionId: competition.id,
          competitionCategoryId: competitionCategory.id,
          roundNumber,
          startsAt: parseCsvDate(firstRoundRow.fecha_inicio, 0),
          endsAt: parseCsvDate(firstRoundRow.fecha_fin, 0)
        }
      });
      matchdaysByRound.set(roundNumber, matchday);
    }

    const groupPlayerNames = new Set(rowsForGroup.flatMap((row) => [row.jugador_local, row.jugador_visitante]).map(normalize));
    const groupPlayers = [];
    for (const rawName of groupPlayerNames) {
      const originalName = rowsForGroup.find((row) => normalize(row.jugador_local) === rawName)?.jugador_local
        ?? rowsForGroup.find((row) => normalize(row.jugador_visitante) === rawName)?.jugador_visitante
        ?? rawName;
      groupPlayers.push(await getOrCreatePlayer(originalName, playersByName));
    }

    groupPlayers.sort((left, right) =>
      `${left.lastName}, ${left.firstName}`.localeCompare(`${right.lastName}, ${right.firstName}`, "ca")
    );

    await prisma.competitionParticipant.createMany({
      data: groupPlayers.map((player) => ({
        competitionId: competition.id,
        competitionCategoryId: competitionCategory.id,
        playerId: player.id
      }))
    });
    createdParticipants += groupPlayers.length;

    for (const row of rowsForGroup.sort((left, right) => Number(left.match_id) - Number(right.match_id))) {
      const home = await getOrCreatePlayer(row.jugador_local, playersByName);
      const away = await getOrCreatePlayer(row.jugador_visitante, playersByName);
      const homeMembership = currentMembership(home, season.id);
      const awayMembership = currentMembership(away, season.id);

      await prisma.match.create({
        data: {
          seasonId: season.id,
          competitionId: competition.id,
          competitionCategoryId: competitionCategory.id,
          leagueMatchdayId: matchdaysByRound.get(Number(row.jornada))?.id ?? null,
          matchType: "individual_league",
          status: "scheduled",
          roundNumber: Number(row.jornada),
          matchOrder: Number(row.partido_en_grupo),
          scheduledAt: parseCsvDate(row.fecha_inicio),
          homePlayerId: home.id,
          awayPlayerId: away.id,
          homeClubIdAtMatchTime: homeMembership?.clubId ?? null,
          awayClubIdAtMatchTime: awayMembership?.clubId ?? null,
          homePlayerNameAtMatchTime: `${home.firstName} ${home.lastName}`,
          awayPlayerNameAtMatchTime: `${away.firstName} ${away.lastName}`,
          homeClubNameAtMatchTime: homeMembership?.clubNameAtThatTime ?? homeMembership?.club?.name ?? null,
          awayClubNameAtMatchTime: awayMembership?.clubNameAtThatTime ?? awayMembership?.club?.name ?? null
        }
      });
      createdMatches += 1;
    }
  }

  return {
    competitionId: competition.id,
    groups: groupRows(rows).length,
    participants: createdParticipants,
    matches: createdMatches,
    missingPlayers: missingPlayers.length
  };
}

async function main() {
  const resolvedPath = path.resolve(csvPath);
  const rows = readCsv(resolvedPath);
  const groups = groupRows(rows);
  const playerCount = new Set(rows.flatMap((row) => [row.jugador_local, row.jugador_visitante]).map(normalize)).size;

  console.log(`CSV: ${resolvedPath}`);
  console.log(`Filas: ${rows.length}`);
  console.log(`Grupos: ${groups.length}`);
  console.log(`Jugadores únicos: ${playerCount}`);
  console.log(`Modo: ${shouldExecute ? "EXECUTE" : "DRY RUN"}`);

  if (!shouldExecute) {
    console.log("Vuelve a ejecutar con --execute para crear la liga.");
    return;
  }

  const result = await importLeague(rows);
  console.log(`Liga creada: ${result.competitionId}`);
  console.log(`Importados ${result.groups} grupos, ${result.participants} participantes y ${result.matches} partidos.`);
  console.log(`Jugadores nuevos creados: ${result.missingPlayers}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
