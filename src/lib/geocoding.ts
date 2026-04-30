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
  const parsed = typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export async function geocodeClubAddress(club: ClubAddress): Promise<ClubGeocodingResult | null> {
  const query = clubGeocodingQuery(club);
  if (!query || query.length < 5) return null;

  const params = new URLSearchParams({
    format: "jsonv2",
    limit: "1",
    countrycodes: "es",
    q: query
  });

  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: {
        "Accept-Language": "ca,es,en",
        "User-Agent": "SquashLeagueManager/0.1.0 (ivan.molera@gmail.com)"
      },
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) return null;

    const results = await response.json() as Array<{ lat?: string; lon?: string }>;
    const first = results[0];
    const latitude = parseCoordinate(first?.lat);
    const longitude = parseCoordinate(first?.lon);

    if (latitude === null || longitude === null) return null;

    return {
      latitude,
      longitude,
      geocodingQuery: query,
      geocodedAt: new Date()
    };
  } catch {
    return null;
  }
}
