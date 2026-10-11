import type { Prisma } from "@prisma/client";

export async function syncFederationManagerAccount(
  tx: Prisma.TransactionClient,
  playerId: string,
  userId: string | null
) {
  const [byPlayer, byUser] = await Promise.all([
    tx.federation.findUnique({ where: { managerPlayerId: playerId }, select: { id: true } }),
    userId
      ? tx.federation.findUnique({ where: { managerUserId: userId }, select: { id: true, managerPlayerId: true } })
      : Promise.resolve(null)
  ]);

  if (byPlayer && byUser && byPlayer.id !== byUser.id) {
    throw new Error("La cuenta y la ficha ya son responsables de federaciones distintas.");
  }

  if (byPlayer) {
    await tx.federation.update({
      where: { id: byPlayer.id },
      data: { managerUserId: userId, updatedAt: new Date() }
    });
  } else if (byUser && !byUser.managerPlayerId) {
    await tx.federation.update({
      where: { id: byUser.id },
      data: { managerPlayerId: playerId, updatedAt: new Date() }
    });
  }

  if (userId && (byPlayer || byUser)) {
    await tx.userRoleAssignment.upsert({
      where: { userId_role: { userId, role: "manager_fed" } },
      update: {},
      create: { userId, role: "manager_fed" }
    });
  }
}

export async function syncClubManagerAccount(
  tx: Prisma.TransactionClient,
  playerId: string,
  userId: string | null
) {
  const [byPlayer, byUser] = await Promise.all([
    tx.club.findUnique({ where: { managerPlayerId: playerId }, select: { id: true } }),
    userId
      ? tx.club.findUnique({ where: { managerUserId: userId }, select: { id: true, managerPlayerId: true } })
      : Promise.resolve(null)
  ]);

  if (byPlayer && byUser && byPlayer.id !== byUser.id) {
    throw new Error("La cuenta y la ficha ya son responsables de clubes distintos.");
  }

  if (byPlayer) {
    await tx.club.update({
      where: { id: byPlayer.id },
      data: { managerUserId: userId, updatedAt: new Date() }
    });
  } else if (byUser && !byUser.managerPlayerId) {
    await tx.club.update({
      where: { id: byUser.id },
      data: { managerPlayerId: playerId, updatedAt: new Date() }
    });
  }

  if (userId && (byPlayer || byUser)) {
    await tx.userRoleAssignment.upsert({
      where: { userId_role: { userId, role: "manager" } },
      update: {},
      create: { userId, role: "manager" }
    });
  }
}
