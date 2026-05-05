import "server-only";

import { prisma } from "@/src/lib/prisma";

type PlayerIdentity = {
  id: string;
  firstName: string;
  lastName: string;
  userId?: string | null;
  user?: { email: string | null; phone: string | null } | null;
  memberships?: Array<{ clubNameAtThatTime: string; club?: { name: string } | null }>;
};

export type PlayerIdentityCandidate = {
  player: PlayerIdentity;
  score: number;
  reasons: string[];
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(josep?|jose)\b/g, "jose")
    .replace(/\b(joan|juan)\b/g, "joan")
    .replace(/\b(maria|ma|mª)\b/g, "maria")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(value: string) {
  return normalize(value).split(/\s+/).filter(Boolean);
}

function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array.from({ length: b.length + 1 }, () => 0);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost
      );
    }
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j];
  }

  return previous[b.length];
}

function stringSimilarity(a: string, b: string) {
  const left = normalize(a);
  const right = normalize(b);
  if (!left && !right) return 1;
  if (!left || !right) return 0;
  const distance = levenshtein(left, right);
  return 1 - distance / Math.max(left.length, right.length);
}

function tokenSimilarity(a: string, b: string) {
  const left = new Set(tokens(a));
  const right = new Set(tokens(b));
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  return intersection / Math.max(left.size, right.size);
}

export function formatPlayerIdentityName(player: Pick<PlayerIdentity, "firstName" | "lastName">) {
  return `${player.lastName}, ${player.firstName}`;
}

export function scorePlayerIdentityMatch(
  input: { firstName: string; lastName: string; email?: string | null; phone?: string | null },
  player: PlayerIdentity
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  const inputFull = `${input.firstName} ${input.lastName}`;
  const playerFull = `${player.firstName} ${player.lastName}`;
  const inputList = `${input.lastName} ${input.firstName}`;
  const playerList = `${player.lastName} ${player.firstName}`;

  const fullSimilarity = Math.max(
    stringSimilarity(inputFull, playerFull),
    stringSimilarity(inputList, playerList),
    stringSimilarity(inputFull, playerList)
  );
  const sharedTokens = Math.max(tokenSimilarity(inputFull, playerFull), tokenSimilarity(inputFull, playerList));

  if (fullSimilarity >= 0.96) {
    score += 72;
    reasons.push("nombre casi exacto");
  } else if (fullSimilarity >= 0.88) {
    score += 58;
    reasons.push("nombre muy parecido");
  } else if (fullSimilarity >= 0.78) {
    score += 42;
    reasons.push("nombre parecido");
  } else {
    score += Math.round(fullSimilarity * 35);
  }

  if (sharedTokens >= 0.9) {
    score += 20;
    reasons.push("mismos componentes de nombre");
  } else if (sharedTokens >= 0.65) {
    score += 12;
    reasons.push("varios componentes coinciden");
  }

  if (input.email && player.user?.email && normalize(input.email) === normalize(player.user.email)) {
    score += 100;
    reasons.push("email coincidente");
  }

  if (input.phone && player.user?.phone && input.phone.replace(/\D/g, "") === player.user.phone.replace(/\D/g, "")) {
    score += 90;
    reasons.push("teléfono coincidente");
  }

  if (player.memberships?.length) {
    score += 4;
    reasons.push("tiene historial de club");
  }

  return { score: Math.min(score, 100), reasons };
}

export async function findPlayerLinkCandidates(input: {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  onlyUnlinked?: boolean;
  minimumScore?: number;
  take?: number;
}) {
  const players = await prisma.player.findMany({
    where: {
      mergedIntoPlayerId: null,
      ...(input.onlyUnlinked ? { userId: null } : {})
    },
    include: {
      user: { select: { email: true, phone: true } },
      memberships: {
        orderBy: { fromDate: "desc" },
        take: 1,
        include: { club: { select: { name: true } } }
      }
    }
  });

  return players
    .map((player) => {
      const match = scorePlayerIdentityMatch(input, player);
      return { player, score: match.score, reasons: match.reasons };
    })
    .filter((candidate) => candidate.score >= (input.minimumScore ?? 70))
    .sort((a, b) => b.score - a.score || formatPlayerIdentityName(a.player).localeCompare(formatPlayerIdentityName(b.player)))
    .slice(0, input.take ?? 5);
}

export async function findPotentialDuplicatePlayers(minimumScore = 82) {
  const players = await prisma.player.findMany({
    where: { mergedIntoPlayerId: null },
    include: {
      user: { select: { email: true, phone: true } },
      memberships: {
        orderBy: { fromDate: "desc" },
        take: 1,
        include: { club: { select: { name: true } } }
      }
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
  });

  const candidates: Array<{
    primary: PlayerIdentity;
    duplicate: PlayerIdentity;
    score: number;
    reasons: string[];
  }> = [];

  for (let i = 0; i < players.length; i += 1) {
    for (let j = i + 1; j < players.length; j += 1) {
      const left = players[i];
      const right = players[j];
      const match = scorePlayerIdentityMatch({
        firstName: left.firstName,
        lastName: left.lastName,
        email: left.user?.email,
        phone: left.user?.phone
      }, right);

      if (match.score >= minimumScore) {
        candidates.push({
          primary: left,
          duplicate: right,
          score: match.score,
          reasons: match.reasons
        });
      }
    }
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, 50);
}
