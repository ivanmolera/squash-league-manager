export type ManagerSelection = { kind: "player" | "user"; id: string } | null;

export function parseManagerSelection(value: string): ManagerSelection {
  if (!value) return null;

  const match = /^(player|user):([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})$/i.exec(value);
  if (!match) throw new Error("Seleccion de responsable invalida.");

  return { kind: match[1] as "player" | "user", id: match[2] };
}
