type ClubMapLocation = {
  name: string;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  province: string | null;
  latitude: number | null;
  longitude: number | null;
};

export function clubMapUrl(club: ClubMapLocation) {
  const { latitude, longitude } = club;
  const hasCoordinates = latitude !== null && longitude !== null
    && Number.isFinite(latitude) && Number.isFinite(longitude)
    && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
    && (latitude !== 0 || longitude !== 0);
  const query = hasCoordinates
    ? `${latitude},${longitude}`
    : [club.address, club.postalCode, club.city, club.province, "España"].filter(Boolean).join(", ") || club.name;

  return query ? `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=16&output=embed` : null;
}
