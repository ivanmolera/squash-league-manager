import "server-only";

import { prisma } from "@/src/lib/prisma";
import { rankingCodesForActiveFederations } from "@/src/lib/ranking-codes";

export async function getActiveRankingCodes() {
  const [federations, psa] = await Promise.all([
    prisma.federation.findMany({
      where: { active: true },
      select: { code: true, ranking: { select: { code: true, active: true } } }
    }),
    prisma.ranking.findUnique({ where: { code: "PSA" }, select: { active: true } })
  ]);
  return rankingCodesForActiveFederations(federations, psa?.active ?? false);
}

export async function assertSelectableRankingCode(code: string, competitionId?: string | null) {
  if ((await getActiveRankingCodes()).includes(code)) return;
  if (competitionId) {
    const existing = await prisma.competition.findUnique({
      where: { id: competitionId },
      select: { rankingCode: true }
    });
    if (existing?.rankingCode === code) return;
  }
  throw new Error("El ránquing seleccionado no pertenece a una federación activa.");
}
