import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function clubGeocodingQuery(club) {
  return [club.address, club.postalCode, club.city, club.province, "España"]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(", ");
}

function uniqueQueries(queries) {
  return [...new Set(queries.map((query) => query.trim()).filter((query) => query.length >= 5))];
}

function clubGeocodingQueries(club) {
  const address = club.address?.trim();
  const postalCode = club.postalCode?.trim();
  const city = club.city?.trim();
  const province = club.province?.trim();
  const name = club.name?.trim();

  return uniqueQueries([
    [address, postalCode, city, province, "España"].filter(Boolean).join(", "),
    [address, postalCode, city, "España"].filter(Boolean).join(", "),
    [address, city, province, "España"].filter(Boolean).join(", "),
    [address, city, "España"].filter(Boolean).join(", "),
    [name, city, province, "España"].filter(Boolean).join(", "),
    [name, city, "España"].filter(Boolean).join(", "),
    [postalCode, city, province, "España"].filter(Boolean).join(", ")
  ]);
}

async function geocodeClub(club) {
  const queries = clubGeocodingQueries(club);
  if (!queries.length) return null;

  for (const query of queries) {
    const params = new URLSearchParams({
      format: "jsonv2",
      limit: "1",
      countrycodes: "es",
      q: query
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: {
        "Accept-Language": "ca,es,en",
        "User-Agent": "SquashLeagueManager/0.1.2 (ivan.molera@gmail.com)"
      }
    });

    if (!response.ok) continue;

    const [first] = await response.json();
    const latitude = Number(first?.lat);
    const longitude = Number(first?.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

    return {
      latitude,
      longitude,
      geocodingQuery: query,
      geocodedAt: new Date()
    };
  }

  return null;
}

async function main() {
  const force = process.argv.includes("--force");
  const clubs = await prisma.club.findMany({
    where: force ? {} : { OR: [{ latitude: null }, { longitude: null }] },
    orderBy: [{ province: "asc" }, { name: "asc" }]
  });

  for (const club of clubs) {
    const result = await geocodeClub(club);
    if (result) {
      await prisma.club.update({
        where: { id: club.id },
        data: result
      });
      console.log(`geocoded: ${club.name} -> ${result.latitude}, ${result.longitude}`);
    } else {
      console.log(`not found: ${club.name}`);
    }
    await sleep(1100);
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
