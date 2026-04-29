export function formatPlayerListName(player: { firstName: string; lastName: string }) {
  return `${player.lastName}, ${player.firstName}`;
}

export function formatUserManagerName(user: {
  email: string;
  displayName: string | null;
  player?: { firstName: string; lastName: string } | null;
}) {
  return user.player ? formatPlayerListName(user.player) : user.displayName ?? user.email;
}
