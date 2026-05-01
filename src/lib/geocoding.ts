type ClubAddress = {
  name?: string | null;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  province?: string | null;
};

export type ClubGeocodingResult = {
  latitude: number;
  longitude: number;
  geocodingQuery: string;
  geocodedAt: Date;
};

export function clubGeocodingQuery(club: ClubAddress) {
  return [club.address, club.postalCode, club.city, club.province, "España"]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(", ");
}

function parseCoordinate(value: unknown) {
  const parsed = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function uniqueQueries(queries: string[]) {
  return [...new Set(queries.map((query) => query.trim()).filter((query) => query.length >= 5))];
}

function clubGeocodingQueries(club: ClubAddress) {
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

export async function geocodeClubAddress(club: ClubAddress): Promise<ClubGeocodingResult | null> {
  const queries = clubGeocodingQueries(club);
  if (!queries.length) return null;

  try {
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
        },
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) continue;

      const results = await response.json() as Array<{ lat?: string | number; lon?: string | number }>;
      const first = results[0];
      const latitude = parseCoordinate(first?.lat);
      const longitude = parseCoordinate(first?.lon);

      if (latitude === null || longitude === null) continue;

      return {
        latitude,
        longitude,
        geocodingQuery: query,
        geocodedAt: new Date()
      };
    }

    return null;
  } catch {
    return null;
  }
}
