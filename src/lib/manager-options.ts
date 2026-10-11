import { formatPlayerListName, formatUserManagerName } from "@/src/lib/names";
import { prisma } from "@/src/lib/prisma";

export async function getManagerOptions(locale: string, noAccount: string, accountOnly: string) {
  const [players, users] = await Promise.all([
    prisma.player.findMany({
      where: { mergedIntoPlayerId: null },
      select: { id: true, firstName: true, lastName: true, userId: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
    }),
    prisma.user.findMany({ include: { player: true }, orderBy: { email: "asc" } })
  ]);

  return [
    ...players.map((player) => ({
      value: `player:${player.id}`,
      name: formatPlayerListName(player),
      note: player.userId ? "" : noAccount
    })),
    ...users.filter((user) => !user.player).map((user) => ({
      value: `user:${user.id}`,
      name: formatUserManagerName(user),
      note: accountOnly
    }))
  ].sort((left, right) => left.name.localeCompare(right.name, locale, { sensitivity: "base" }));
}
