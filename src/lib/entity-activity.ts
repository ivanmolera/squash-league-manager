import type { Prisma } from "@prisma/client";

export const activePlayerWhere = {
  active: true,
  mergedIntoPlayerId: null
} satisfies Prisma.PlayerWhereInput;

export const activeClubWhere = {
  active: true,
  OR: [
    { federationId: null },
    { federation: { is: { active: true } } }
  ]
} satisfies Prisma.ClubWhereInput;

export const activeFederationWhere = {
  active: true
} satisfies Prisma.FederationWhereInput;

export function isClubEffectivelyActive(club: { active: boolean; federation?: { active: boolean } | null }) {
  return club.active && (club.federation?.active ?? true);
}
