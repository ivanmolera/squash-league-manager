export function tournamentSeasonForDate(startsAt: Date) {
  if (Number.isNaN(startsAt.getTime())) {
    throw new Error("La fecha de inicio del torneo no es válida.");
  }

  const year = startsAt.getUTCFullYear();
  const startYear = startsAt.getUTCMonth() >= 8 ? year : year - 1;
  const endYear = startYear + 1;

  return {
    name: `${startYear}/${String(endYear).slice(-2)}`,
    startsAt: new Date(Date.UTC(startYear, 8, 1)),
    endsAt: new Date(Date.UTC(endYear, 7, 31))
  };
}
