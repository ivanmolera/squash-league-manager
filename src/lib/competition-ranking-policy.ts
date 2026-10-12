export function leagueRankingCode(hostClubId: string | null | undefined, rankingCode: string) {
  if (hostClubId && rankingCode !== "none") {
    throw new Error("Una liga de club solo puede puntuar para la clasificación del club.");
  }
  return rankingCode;
}

export function federationCodeForTournamentRanking(rankingCode: string) {
  if (rankingCode === "none") return null;
  return rankingCode === "PSA" ? "RFES" : rankingCode;
}
