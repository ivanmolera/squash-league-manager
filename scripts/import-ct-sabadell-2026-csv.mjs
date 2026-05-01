import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const defaultCsvPath = "/Users/ivan.molera/Downloads/torneo_ct_sabadell_2026_2a_3a.csv";
const defaultTournamentId = "794a2d98-e01d-407d-80d2-0028233df324";
const csvPath = process.argv.find((arg) => arg.endsWith(".csv")) ?? defaultCsvPath;
const tournamentId = process.argv.find((arg) => arg.startsWith("--tournament-id="))?.split("=")[1] ?? defaultTournamentId;
const shouldExecute = process.argv.includes("--execute");

const categoryNameByCsv = new Map([
  ["2ª categoría", "Segunda"],
  ["3ª categoría", "Tercera"]
]);

const mainDrawEntries = {
  Segunda: [
    "ALEIX ROMERO", null, "BERNAT SERNA", "TONI FERNÁNDEZ",
    "ALEX FERNÁNDEZ", null, "IVÁN SERRANO", null,
    "CARLOS MARTÍN", null, "SANTI GRAU", null,
    "URI HERRERO", "ORIOL MESTRE", "XAVI BLASCO", null
  ],
  Tercera: [
    "JORDI CAUPENA", null, "DIEGO DÁVILA", "ENRIC VERGARA",
    "MÀRIUS TARRÉS", "BRUNO DE LAS HERAS", "PERE BIGORRA", "RUBÉN BERDOMÀS",
    "SERGI VILLA", "LLUIS ISERN", "ANTONI RELLO", "ENRIQUE TEJERINA",
    "PACO ESPINOSA", "FRANCESC COSP", "FRANCESC ABELLA", "ROGER CAPDET"
  ]
};

const consolationDrawEntries = {
  Segunda: [
    "BERNAT SERNA", null, "ALEX FERNÁNDEZ", "URI HERRERO",
    "TONI FERNÁNDEZ", "SANTI GRAU", "XAVI BLASCO", null
  ],
  Tercera: [
    "ENRIC VERGARA", "MÀRIUS TARRÉS", "LLUIS ISERN", "ROGER CAPDET",
    "SERGI VILLA", null, "DIEGO DÁVILA", "BRUNO DE LAS HERAS",
    "PERE BIGORRA", "ANTONI RELLO", "PACO ESPINOSA", "FRANCESC ABELLA",
    null, null, null, null
  ]
};

const mainPlacement = new Map([
  ["2A-P-B", [1, 2]], ["2A-P-A", [2, 1]], ["2A-P-C", [2, 2]], ["2A-P-SF1", [3, 1]],
  ["2A-P-D", [2, 3]], ["2A-P-E", [1, 7]], ["2A-P-F", [2, 4]], ["2A-P-SF2", [3, 2]],
  ["2A-P-FINAL", [4, 1]], ["2A-P-3_4", [4, 1]],
  ["3A-P-R1-1", [1, 2]], ["3A-P-QF1", [2, 1]], ["3A-P-R1-2", [1, 3]], ["3A-P-R1-3", [1, 4]],
  ["3A-P-QF2", [2, 2]], ["3A-P-SF1", [3, 1]], ["3A-P-R1-4", [1, 5]], ["3A-P-R1-5", [1, 6]],
  ["3A-P-QF3", [2, 3]], ["3A-P-R1-6", [1, 7]], ["3A-P-R1-7", [1, 8]], ["3A-P-QF4", [2, 4]],
  ["3A-P-SF2", [3, 2]], ["3A-P-FINAL", [4, 1]], ["3A-P-3_4", [4, 1]]
]);

const consolationPlacement = new Map([
  ["2A-C-C_E", [1, 2]], ["2A-C-B_D", [1, 3]], ["2A-C-A_vs_CE", [2, 1]], ["2A-C-BD_vs_F", [2, 2]],
  ["2A-C-5_6", [3, 1]], ["2A-C-7_8", [3, 2]], ["2A-C-9_10", [3, 3]],
  ["3A-C-5_8-SF1", [1, 1]], ["3A-C-5_8-SF2", [1, 2]], ["3A-C-5_6", [2, 1]], ["3A-C-7_8", [2, 2]],
  ["3A-C-R9-1", [1, 4]], ["3A-C-9_12-SF1", [2, 3]], ["3A-C-R9-2", [1, 5]], ["3A-C-R9-3", [1, 6]],
  ["3A-C-9_12-SF2", [2, 4]], ["3A-C-9_10", [3, 2]], ["3A-C-11_12", [3, 3]], ["3A-C-R13-1", [2, 5]],
  ["3A-C-13_14", [3, 4]]
]);

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

function normalize(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function titleCaseName(value) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part ? part[0].toLocaleUpperCase("ca-ES") + part.slice(1) : part)
    .join(" ");
}

function splitPlayerName(value) {
  const titled = titleCaseName(value);
  const parts = titled.split(/\s+/);
  return {
    firstName: parts.shift() ?? titled,
    lastName: parts.join(" ") || "-"
  };
}

function playerDisplayName(player) {
  return `${player.firstName} ${player.lastName}`.trim();
}

function isPlaceholder(value) {
  return !value || normalize(value).startsWith("pendiente");
}

function dateTime(row) {
  if (!row.fecha) return null;
  const time = row.hora || "12:00";
  return new Date(`${row.fecha}T${time}:00.000Z`);
}

function parseSets(row, winnerSide) {
  const raw = row.parciales;
  if (!raw) return [];
  const pieces = raw.split(";").map((item) => item.trim()).filter(Boolean);
  const sets = [];

  for (const piece of pieces) {
    const match = piece.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (!match) return [];
    sets.push({ homePoints: Number(match[1]), awayPoints: Number(match[2]) });
  }

  const homeSets = sets.filter((set) => set.homePoints > set.awayPoints).length;
  const awaySets = sets.filter((set) => set.awayPoints > set.homePoints).length;
  const completeWinnerSide = homeSets >= 3 ? "home" : awaySets >= 3 ? "away" : null;

  return completeWinnerSide && completeWinnerSide === winnerSide ? sets : [];
}

function seedNumbers(rows) {
  const seededRows = rows
    .filter((row) => row.tipo_registro === "participante" && row.seed_jugador_1)
    .sort((a, b) => {
      const firstA = Number(a.seed_jugador_1.split("/")[0]);
      const firstB = Number(b.seed_jugador_1.split("/")[0]);
      return firstA - firstB || Number(a.ranking_jugador_1 || 9999) - Number(b.ranking_jugador_1 || 9999);
    });
  const counters = new Map();

  return new Map(seededRows.map((row) => {
    const first = Number(row.seed_jugador_1.split("/")[0]);
    const next = counters.get(first) ?? first;
    counters.set(first, next + 1);
    return [normalize(row.jugador_1), next];
  }));
}

async function playersByName(rows) {
  const existingPlayers = await prisma.player.findMany();
  const byName = new Map(existingPlayers.map((player) => [normalize(playerDisplayName(player)), player]));
  const participantNames = [...new Set(rows
    .filter((row) => row.tipo_registro === "participante")
    .map((row) => row.jugador_1)
    .filter(Boolean))];
  const created = [];

  for (const rawName of participantNames) {
    const key = normalize(rawName);
    if (byName.has(key)) continue;

    const { firstName, lastName } = splitPlayerName(rawName);
    const player = await prisma.player.create({
      data: {
        firstName,
        lastName,
        gender: "male",
        dominantHand: "not_specified",
        genericProfileVariant: "male",
        showContactPublic: true,
        showPhysicalPublic: false
      }
    });
    byName.set(key, player);
    created.push(playerDisplayName(player));
  }

  return { byName, created };
}

function sideForWinner(row) {
  const winner = normalize(row.ganador);
  if (!winner) return null;
  if (winner === normalize(row.jugador_1)) return "home";
  if (winner === normalize(row.jugador_2)) return "away";
  return null;
}

function matchType(row) {
  if (row.ronda.includes("3º/4º")) return "tournament_third_place";
  return normalize(row.fase) === "consolacion" ? "tournament_consolation" : "tournament_knockout";
}

function placementFor(row, type) {
  const source = type === "tournament_consolation" ? consolationPlacement : mainPlacement;
  const [roundNumber, bracketPosition] = source.get(row.partido_id) ?? [1, 1];
  return { roundNumber, bracketPosition };
}

async function createDrawEntries(tx, competitionCategoryId, entries, bracketType, playerMap, seedMap) {
  for (let index = 0; index < entries.length; index += 1) {
    const rawName = entries[index];
    const player = rawName ? playerMap.get(normalize(rawName)) : null;
    await tx.tournamentDrawEntry.create({
      data: {
        competitionCategoryId,
        bracketType,
        bracketPosition: index + 1,
        playerId: player?.id ?? null,
        playerNameAtTime: player ? playerDisplayName(player) : "BYE",
        seedNumber: rawName ? seedMap.get(normalize(rawName)) ?? null : null,
        isBye: !rawName
      }
    });
  }
}

async function createByeMatches(tx, competition, competitionCategoryId, entries, bracketType, matchTypeValue) {
  for (let index = 0; index < entries.length; index += 2) {
    const homeName = entries[index];
    const awayName = entries[index + 1];
    if (homeName && awayName) continue;
    if (!homeName && !awayName) continue;

    const winnerName = homeName ?? awayName;
    const player = competition.players.get(normalize(winnerName));
    await tx.match.create({
      data: {
        seasonId: competition.seasonId,
        competitionId: competition.id,
        competitionCategoryId,
        matchType: matchTypeValue,
        status: "bye",
        roundNumber: 1,
        matchOrder: index / 2 + 1,
        bracketPosition: index / 2 + 1,
        scheduledAt: competition.startsAt,
        playedAt: competition.startsAt,
        venueClubId: competition.hostClubId,
        homePlayerId: homeName ? player?.id ?? null : null,
        awayPlayerId: awayName ? player?.id ?? null : null,
        winnerPlayerId: player?.id ?? null,
        homePlayerNameAtMatchTime: homeName ? playerDisplayName(player) : "BYE",
        awayPlayerNameAtMatchTime: awayName ? playerDisplayName(player) : "BYE",
        homeClubNameAtMatchTime: competition.hostClubName,
        awayClubNameAtMatchTime: competition.hostClubName
      }
    });
  }
}

async function importTournament(rows) {
  const competition = await prisma.competition.findUniqueOrThrow({
    where: { id: tournamentId },
    include: { hostClub: true, categories: { include: { category: true } } }
  });
  const categoryByName = new Map(competition.categories.map((item) => [item.category.name, item]));
  const { byName, created } = await playersByName(rows);
  const seedMap = seedNumbers(rows);
  const participantRows = rows.filter((row) => row.tipo_registro === "participante");
  const matchRows = rows.filter((row) => row.tipo_registro === "partido");
  const targetCategoryIds = [...categoryByName.values()].map((category) => category.id);

  if (!categoryByName.has("Segunda") || !categoryByName.has("Tercera")) {
    throw new Error("El torneo no tiene las categorías Segunda y Tercera configuradas.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.match.deleteMany({ where: { competitionId: competition.id, competitionCategoryId: { in: targetCategoryIds } } });
    await tx.tournamentDrawEntry.deleteMany({ where: { competitionCategoryId: { in: targetCategoryIds } } });
    await tx.tournamentSeed.deleteMany({ where: { competitionCategoryId: { in: targetCategoryIds } } });
    await tx.tournamentRegistration.deleteMany({ where: { competitionCategoryId: { in: targetCategoryIds } } });
    await tx.competitionParticipant.deleteMany({ where: { competitionId: competition.id, competitionCategoryId: { in: targetCategoryIds } } });

    for (const competitionCategory of categoryByName.values()) {
      await tx.competitionCategory.update({
        where: { id: competitionCategory.id },
        data: { format: "knockout" }
      });
    }

    for (const row of participantRows) {
      const categoryName = categoryNameByCsv.get(row.categoria);
      const competitionCategory = categoryName ? categoryByName.get(categoryName) : null;
      const player = byName.get(normalize(row.jugador_1));
      if (!competitionCategory || !player) continue;
      const seedNumber = seedMap.get(normalize(row.jugador_1)) ?? null;

      await tx.competitionParticipant.create({
        data: {
          competitionId: competition.id,
          competitionCategoryId: competitionCategory.id,
          playerId: player.id,
          seedNumber
        }
      });
      await tx.tournamentRegistration.create({
        data: {
          competitionCategoryId: competitionCategory.id,
          playerId: player.id,
          playerNameAtRegistration: playerDisplayName(player),
          status: "accepted"
        }
      });
      if (seedNumber) {
        await tx.tournamentSeed.create({
          data: {
            competitionCategoryId: competitionCategory.id,
            playerId: player.id,
            playerNameAtTime: playerDisplayName(player),
            seedNumber,
            suggested: false
          }
        });
      }
    }

    const importContext = {
      id: competition.id,
      seasonId: competition.seasonId,
      hostClubId: competition.hostClubId,
      hostClubName: competition.hostClub?.name ?? null,
      startsAt: competition.startsAt,
      players: byName
    };

    for (const [categoryName, entries] of Object.entries(mainDrawEntries)) {
      const competitionCategory = categoryByName.get(categoryName);
      await createDrawEntries(tx, competitionCategory.id, entries, "main", byName, seedMap);
      await createByeMatches(tx, importContext, competitionCategory.id, entries, "main", "tournament_knockout");
    }

    for (const [categoryName, entries] of Object.entries(consolationDrawEntries)) {
      const competitionCategory = categoryByName.get(categoryName);
      await createDrawEntries(tx, competitionCategory.id, entries, "consolation", byName, seedMap);
      await createByeMatches(tx, importContext, competitionCategory.id, entries, "consolation", "tournament_consolation");
    }

    for (const row of matchRows) {
      const categoryName = categoryNameByCsv.get(row.categoria);
      const competitionCategory = categoryName ? categoryByName.get(categoryName) : null;
      if (!competitionCategory) continue;

      const type = matchType(row);
      const placement = placementFor(row, type);
      const homePlayer = isPlaceholder(row.jugador_1) ? null : byName.get(normalize(row.jugador_1));
      const awayPlayer = isPlaceholder(row.jugador_2) ? null : byName.get(normalize(row.jugador_2));
      const winnerSide = sideForWinner(row);
      const winnerPlayer = winnerSide === "home" ? homePlayer : winnerSide === "away" ? awayPlayer : null;
      const isWalkover = normalize(row.marcador).replace(/\./g, "") === "wo";
      const sets = isWalkover ? [] : parseSets(row, winnerSide);
      const scheduledAt = dateTime(row);
      const status = isWalkover ? "walkover" : winnerPlayer ? "played" : "scheduled";
      const loserPlayer = winnerSide === "home" ? awayPlayer : winnerSide === "away" ? homePlayer : null;

      await tx.match.create({
        data: {
          seasonId: competition.seasonId,
          competitionId: competition.id,
          competitionCategoryId: competitionCategory.id,
          matchType: type,
          status,
          roundNumber: placement.roundNumber,
          matchOrder: placement.bracketPosition,
          bracketPosition: placement.bracketPosition,
          scheduledAt,
          playedAt: status === "played" || status === "walkover" ? scheduledAt : null,
          venueClubId: competition.hostClubId,
          homePlayerId: homePlayer?.id ?? null,
          awayPlayerId: awayPlayer?.id ?? null,
          winnerPlayerId: winnerPlayer?.id ?? null,
          walkoverByPlayerId: isWalkover ? loserPlayer?.id ?? null : null,
          homePlayerNameAtMatchTime: homePlayer ? playerDisplayName(homePlayer) : row.jugador_1 || null,
          awayPlayerNameAtMatchTime: awayPlayer ? playerDisplayName(awayPlayer) : row.jugador_2 || null,
          homeClubNameAtMatchTime: competition.hostClub?.name ?? null,
          awayClubNameAtMatchTime: competition.hostClub?.name ?? null,
          sets: sets.length
            ? { create: sets.map((set, index) => ({ setNumber: index + 1, ...set })) }
            : undefined
        }
      });
    }
  }, { timeout: 30000 });

  return {
    createdPlayers: created,
    participants: participantRows.length,
    matches: matchRows.length
  };
}

async function main() {
  const rows = readCsv(path.resolve(csvPath));
  console.log(`CSV: ${path.resolve(csvPath)}`);
  console.log(`Torneo: ${tournamentId}`);
  console.log(`Participantes: ${rows.filter((row) => row.tipo_registro === "participante").length}`);
  console.log(`Partidos: ${rows.filter((row) => row.tipo_registro === "partido").length}`);
  console.log(`Modo: ${shouldExecute ? "EXECUTE" : "DRY RUN"}`);

  if (!shouldExecute) {
    console.log("Vuelve a ejecutar con --execute para cargar el torneo.");
    return;
  }

  const result = await importTournament(rows);
  console.log(`Participantes importados: ${result.participants}`);
  console.log(`Partidos importados desde CSV: ${result.matches}`);
  console.log(`Jugadores creados: ${result.createdPlayers.length ? result.createdPlayers.join(", ") : "ninguno"}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
