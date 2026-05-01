import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const defaultCsvPath = "/Users/ivan.molera/Downloads/torneos_esquaix_2026_sin_squash57.csv";
const csvPath = process.argv.find((arg) => arg.endsWith(".csv")) ?? defaultCsvPath;
const shouldExecute = process.argv.includes("--execute");
const seasonName = "2026";

const venueAliases = new Map([
  ["c.e. mediterrani", "CE Mediterrani"],
  ["c.n. sant andreu", "CN Sant Andreu"],
  ["ceac", "CEAC Castellet"],
  ["club tennis sabadell", "CT Sabadell"],
  ["geieg, girona", "GEIEG"],
  ["marconi, terrassa", "Esquaix Marconi"],
  ["melich, sant just", "Can Mèlich"],
  ["saf uab", "SAF UAB"],
  ["tipi park", "Tipi Park"],
  ["tipi park, sta. cristina", "Tipi Park"]
]);

const venuesToCreate = new Map([
  ["CUENCA", { name: "Cuenca", city: "Cuenca", province: "Cuenca" }],
  ["PALÈNCIA", { name: "Palència", city: "Palencia", province: "Palencia" }],
  ["PONFERRADA", { name: "Ponferrada", city: "Ponferrada", province: "León" }],
  ["SANTIAGO", { name: "Santiago de Compostela", city: "Santiago de Compostela", province: "A Coruña" }],
  ["SESTAO", { name: "Sestao", city: "Sestao", province: "Bizkaia" }],
  ["TENERIFE", { name: "Tenerife", city: "Santa Cruz de Tenerife", province: "Santa Cruz de Tenerife" }],
  ["VALÈNCIA", { name: "València", city: "València", province: "Valencia" }]
]);

const categoryTextMap = new Map([
  ["+45", ["Masc +45"]],
  ["+50", ["Masc +50"]],
  ["+55", ["Masc +55"]],
  ["+60", ["Masc +60"]],
  ["2ª categoria", ["Segunda"]],
  ["3ª categoria", ["Tercera"]],
  ["Absolut", ["Open"]],
  ["Absoluta", ["Open"]],
  ["Clubs", ["Open"]],
  ["Esquaixics", ["Open"]],
  ["Fem +35", ["Fem +35"]],
  ["Femení", ["Femenina"]],
  ["Junior Open", ["Masc Sub-19", "Fem Sub-19"]],
  ["Masters", ["Masc +35", "Fem +35"]],
  ["Open 3ª categoria", ["Tercera"]],
  ["Open internacional", ["Open"]],
  ["PSA", ["Open"]],
  ["PSA satèl·lit", ["Open"]],
  ["Provincial", ["Open"]],
  ["Seleccions autonòmiques", ["Open"]],
  ["Sots 9", ["Masc Sub-9", "Fem Sub-9"]],
  ["Sots 11", ["Masc Sub-11", "Fem Sub-11"]],
  ["Sots 13", ["Masc Sub-13", "Fem Sub-13"]],
  ["Sots 15", ["Masc Sub-15", "Fem Sub-15"]],
  ["Sots 15 mixt", ["Masc Sub-15", "Fem Sub-15"]],
  ["Sots 17", ["Masc Sub-17", "Fem Sub-17"]],
  ["Sots 17 mixt", ["Masc Sub-17", "Fem Sub-17"]],
  ["Sots 19", ["Masc Sub-19", "Fem Sub-19"]],
  ["Veterans", ["Masc +35", "Fem +35"]],
  ["Veterans +35", ["Masc +35"]],
  ["Veterans +40", ["Masc +40"]]
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
    } else if (char === ";" && !inQuotes) {
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

function parseDate(value, endOfDay = false) {
  const date = new Date(`${value}T${endOfDay ? "22:00:00" : "00:00:00"}.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Fecha CSV no válida: ${value}`);
  }
  return date;
}

function rankingCodeForRow(row) {
  const value = normalize(row.puntuacion);
  if (!value) return "none";
  if (value.includes("rfes")) return "RFES";
  if (value.includes("psa")) return "PSA";
  return "CAT";
}

function rankingScopeForCode(code) {
  if (code === "RFES") return "state";
  if (code === "PSA") return "psa";
  if (code === "none") return "none";
  return "autonomic";
}

function categoryNamesForRow(row) {
  const names = new Set();
  const rawCategories = row.categorias_incluidas.split(";").map((item) => item.trim()).filter(Boolean);

  for (const item of rawCategories) {
    const mapped = categoryTextMap.get(item);
    if (!mapped) {
      names.add("Open");
      continue;
    }
    mapped.forEach((name) => names.add(name));
  }

  if (row.incluye_femenino === "no") {
    names.delete("Femenina");
    names.delete("Fem +35");
    [...names].filter((name) => name.startsWith("Fem Sub-")).forEach((name) => names.delete(name));
  }

  if (row.incluye_masculino === "no") {
    names.delete("Open");
    [...names].filter((name) => name.startsWith("Masc ")).forEach((name) => names.delete(name));
    if (!names.size) names.add("Femenina");
  }

  if (!names.size) names.add("Open");
  return [...names];
}

function descriptionForRow(row) {
  const lines = [
    row.importName !== row.torneo ? `Nom original: ${row.torneo}` : null,
    row.modalidad ? `Modalitat: ${row.modalidad}` : null,
    row.categorias_incluidas ? `Categories CSV: ${row.categorias_incluidas}` : null,
    row.puntuacion ? `Puntuació: ${row.puntuacion}` : null,
    row.licencia ? `Llicència: ${row.licencia}` : null,
    row.premios ? `Premis: ${row.premios}` : null,
    row.fechas_texto ? `Dates originals: ${row.mes} ${row.fechas_texto}` : null,
    row.sede_club ? `Seu original: ${row.sede_club}` : null
  ].filter(Boolean);
  return lines.join("\n");
}

function rowsWithImportNames(rows) {
  const counts = rows.reduce((accumulator, row) => {
    accumulator.set(row.torneo, (accumulator.get(row.torneo) ?? 0) + 1);
    return accumulator;
  }, new Map());

  return rows.map((row) => ({
    ...row,
    importName: counts.get(row.torneo) > 1 ? `${row.torneo} - ${row.sede_club}` : row.torneo
  }));
}

async function getSeason(rows) {
  const startsAt = parseDate(rows[0].fecha_inicio);
  const endsAt = parseDate(rows[rows.length - 1].fecha_fin, true);
  return prisma.season.upsert({
    where: { name: seasonName },
    update: {
      startsAt,
      endsAt,
      status: "active"
    },
    create: {
      name: seasonName,
      startsAt,
      endsAt,
      status: "active"
    }
  });
}

async function getCategories() {
  const categories = await prisma.category.findMany();
  return new Map(categories.map((category) => [category.name, category]));
}

async function getClubsByName() {
  const clubs = await prisma.club.findMany();
  return new Map(clubs.map((club) => [normalize(club.name), club]));
}

async function getVenueClub(row, clubsByName) {
  const venue = row.sede_club;
  const alias = venueAliases.get(normalize(venue));
  if (alias) {
    const club = clubsByName.get(normalize(alias));
    if (!club) throw new Error(`El club existente "${alias}" no se ha encontrado.`);
    return club;
  }

  const createData = venuesToCreate.get(venue);
  if (!createData) {
    throw new Error(`No hay datos de localidad/provincia para crear la sede "${venue}".`);
  }

  const existing = clubsByName.get(normalize(createData.name));
  if (existing) return existing;

  const club = await prisma.club.create({
    data: {
      name: createData.name,
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

async function importTournaments(rows) {
  const season = await getSeason(rows);
  const categories = await getCategories();
  const clubsByName = await getClubsByName();
  let createdClubs = 0;

  for (const row of rows) {
    const beforeClubCount = clubsByName.size;
    const hostClub = await getVenueClub(row, clubsByName);
    if (clubsByName.size > beforeClubCount) createdClubs += 1;
    const rankingCode = rankingCodeForRow(row);
    const competition = await prisma.competition.upsert({
      where: {
        seasonId_type_name: {
          seasonId: season.id,
          type: "tournament",
          name: row.importName
        }
      },
      update: {
        status: "registration_open",
        description: descriptionForRow(row),
        bestOfSets: 5,
        hostClubId: hostClub.id,
        rankingScope: rankingScopeForCode(rankingCode),
        rankingCode,
        registrationDeadline: parseDate(row.fecha_inicio),
        startsAt: parseDate(row.fecha_inicio),
        endsAt: parseDate(row.fecha_fin, true)
      },
      create: {
        seasonId: season.id,
        type: "tournament",
        status: "registration_open",
        name: row.importName,
        description: descriptionForRow(row),
        bestOfSets: 5,
        hostClubId: hostClub.id,
        rankingScope: rankingScopeForCode(rankingCode),
        rankingCode,
        registrationDeadline: parseDate(row.fecha_inicio),
        startsAt: parseDate(row.fecha_inicio),
        endsAt: parseDate(row.fecha_fin, true)
      }
    });

    await prisma.competitionCategory.deleteMany({
      where: { competitionId: competition.id }
    });

    const categoryNames = categoryNamesForRow(row);
    for (const categoryName of categoryNames) {
      const category = categories.get(categoryName);
      if (!category) throw new Error(`No existe la categoría oficial "${categoryName}".`);
      await prisma.competitionCategory.create({
        data: {
          competitionId: competition.id,
          categoryId: category.id,
          displayName: category.name,
          format: "knockout"
        }
      });
    }
  }

  return {
    tournaments: rows.length,
    createdClubs
  };
}

async function main() {
  const resolvedPath = path.resolve(csvPath);
  const rows = rowsWithImportNames(readCsv(resolvedPath));
  const venues = new Set(rows.map((row) => row.sede_club));

  console.log(`CSV: ${resolvedPath}`);
  console.log(`Torneos: ${rows.length}`);
  console.log(`Sedes: ${venues.size}`);
  console.log(`Modo: ${shouldExecute ? "EXECUTE" : "DRY RUN"}`);

  if (!shouldExecute) {
    console.log("Vuelve a ejecutar con --execute para crear o actualizar los torneos.");
    return;
  }

  const result = await importTournaments(rows);
  console.log(`Importados ${result.tournaments} torneos.`);
  console.log(`Clubes/sedes creados: ${result.createdClubs}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
