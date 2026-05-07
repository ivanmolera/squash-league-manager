export function formatPlayerListName(player: { firstName: string; lastName: string }) {
  return `${player.lastName}, ${player.firstName}`;
}

function formatDisplayNameAsListName(displayName: string) {
  const value = displayName.trim();
  if (!value || value.includes(",")) return value;
  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return value;
  return `${parts.slice(1).join(" ")}, ${parts[0]}`;
}

export function formatUserManagerName(user: {
  email: string;
  displayName: string | null;
  player?: { firstName: string; lastName: string } | null;
}) {
  return user.player
    ? formatPlayerListName(user.player)
    : user.displayName
    ? formatDisplayNameAsListName(user.displayName)
    : user.email;
}
