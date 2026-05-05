type CategoryLike = {
  genderScope?: string | null;
  name?: string | null;
};

function largestPowerOfTwoAtMost(value: number) {
  let result = 0;
  for (let candidate = 1; candidate <= value; candidate *= 2) {
    result = candidate;
  }
  return result;
}

export function maxTournamentSeedCount(rankingCode: string | null | undefined, participantCount: number) {
  if (participantCount < 2) return 0;

  if (rankingCode === "RFES") {
    return largestPowerOfTwoAtMost(Math.floor(participantCount / 2));
  }

  if (rankingCode === "CAT") {
    return Math.floor(participantCount / 4);
  }

  return Math.min(8, Math.floor(participantCount / 4));
}

export function expectedTeamRubberCount(rankingCode: string | null | undefined, category: CategoryLike) {
  if (rankingCode === "CAT") return 3;
  if (rankingCode === "RFES") return category.genderScope === "female" ? 3 : 4;
  return 4;
}

export function maxTeamRosterSize(rankingCode: string | null | undefined, category: CategoryLike) {
  if (rankingCode === "CAT") return 5;
  if (rankingCode === "RFES") return category.genderScope === "female" ? 5 : 6;
  return null;
}
