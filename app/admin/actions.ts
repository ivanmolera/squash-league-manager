"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/prisma";
import { generateRoundRobin, nextPowerOfTwo, shuffle } from "@/src/lib/schedule";

const testPassword = "TestUser1234";

const playerSchema = z.object({
  playerId: z.string().uuid().optional().or(z.literal("")),
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  emailVerified: z.coerce.boolean().default(false),
  preferredLocale: z.enum(["ca", "es", "en"]).default("es"),
  gender: z.enum(["male", "female", "other", "not_specified"]),
  dominantHand: z.enum(["right", "left", "ambidextrous", "not_specified"]),
  heightCm: z.coerce.number().int().min(90).max(240).optional().or(z.literal("")),
  weightKg: z.coerce.number().min(20).max(250).optional().or(z.literal("")),
  racketBrand: z.string().optional(),
  showContactPublic: z.coerce.boolean().default(false),
  showPhysicalPublic: z.coerce.boolean().default(false),
  clubId: z.string().uuid().optional().or(z.literal("")),
  profilePhotoUrl: z.string().optional(),
  receivesMatchCommunications: z.coerce.boolean().default(false)
});

const clubSchema = z.object({
  clubId: z.string().uuid().optional().or(z.literal("")),
  name: z.string().min(3),
  city: z.string().optional(),
  province: z.string().optional(),
  address: z.string().optional(),
  websiteUrl: z.string().url().optional().or(z.literal("")),
  showContactPublic: z.coerce.boolean().default(false),
  managerUserId: z.string().uuid().optional().or(z.literal(""))
});

const competitionSchema = z.object({
  competitionId: z.string().uuid().optional().or(z.literal("")),
  name: z.string().min(3),
  description: z.string().optional(),
  type: z.enum(["individual_league", "team_league"]),
  bestOfSets: z.coerce.number().int().refine((value) => value === 3 || value === 5),
  registrationDeadline: z.string().min(10),
  startsAt: z.string().min(10),
  endsAt: z.string().min(10),
  participantIds: z.array(z.string().uuid()).default([])
});

const tournamentSchema = z.object({
  competitionId: z.string().uuid().optional().or(z.literal("")),
  name: z.string().min(3),
  description: z.string().optional(),
  hostClubId: z.string().uuid(),
  refereeName: z.string().optional(),
  rankingScope: z.enum(["none", "autonomic", "state", "psa"]).default("none"),
  bestOfSets: z.coerce.number().int().refine((value) => value === 3 || value === 5),
  registrationDeadline: z.string().min(10),
  startsAt: z.string().min(10),
  endsAt: z.string().min(10),
  categoryIds: z.array(z.string().uuid()).default([]),
  participantIds: z.array(z.string().uuid()).default([]),
  seedPlayerIds: z.array(z.string().uuid()).default([]),
  seedEntries: z.array(z.string()).default([])
});

const teamSchema = z.object({
  teamId: z.string().uuid(),
  name: z.string().min(3),
  showRosterPublic: z.coerce.boolean().default(false)
});

const matchResultSchema = z.object({
  matchId: z.string().uuid()
});

const removeClubPlayerSchema = z.object({
  membershipId: z.string().uuid(),
  clubId: z.string().uuid()
});

const tournamentRegistrationSchema = z.object({
  competitionCategoryId: z.string().uuid(),
  playerId: z.string().uuid().optional()
});

const tournamentSeedsSchema = z.object({
  competitionCategoryId: z.string().uuid(),
  seedPlayerIds: z.array(z.string().uuid()).default([])
});

function textValue(value: unknown) {
  return value?.toString().trim() || undefined;
}

function toArray(formData: FormData, key: string) {
  return formData.getAll(key).map(String).filter(Boolean);
}

function hasRole(user: Awaited<ReturnType<typeof getCurrentUser>>, role: "admin" | "manager" | "player") {
  return Boolean(user?.roles.some((assignment) => assignment.role === role));
}

function genericProfileVariant(gender: "male" | "female" | "other" | "not_specified") {
  if (gender === "male" || gender === "female") return gender;
  return "neutral";
}

async function readProfilePhoto(formData: FormData) {
  const file = formData.get("profilePhoto");
  if (!(file instanceof File) || file.size === 0) return undefined;

  if (!file.type.startsWith("image/")) {
    throw new Error("La foto debe ser una imagen.");
  }

  if (file.size > 1_500_000) {
    throw new Error("La foto no puede superar 1,5 MB.");
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  return `data:${file.type};base64,${bytes.toString("base64")}`;
}

async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("Debes iniciar sesión para modificar datos.");
  }

  return user;
}

async function requireAdmin() {
  const user = await requireUser();

  if (!hasRole(user, "admin")) {
    throw new Error("Solo un usuario admin puede realizar esta accion.");
  }

  return user;
}

async function getDefaultSeason() {
  return prisma.season.upsert({
    where: { name: "2025/26" },
    update: {},
    create: {
      name: "2025/26",
      startsAt: new Date("2025-09-01"),
      endsAt: new Date("2026-06-30"),
      status: "active"
    }
  });
}

async function getDefaultCategory() {
  const existing = await prisma.category.findFirst({
    where: { name: "General", genderScope: "not_specified" }
  });

  if (existing) {
    return existing;
  }

  return prisma.category.create({
    data: {
      name: "General",
      genderScope: "not_specified",
      sortOrder: 1
    }
  });
}

async function ensureCredential(userId: string) {
  const passwordHash = await bcrypt.hash(testPassword, 12);
  await prisma.authCredential.upsert({
    where: { userId },
    update: {},
    create: { userId, passwordHash }
  });
}

function parsePointValue(value: FormDataEntryValue | null) {
  const text = value?.toString();
  if (!text) return null;
  const number = Number(text);
  if (!Number.isInteger(number) || number < 0 || number > 60) {
    throw new Error("Selecciona puntuaciones de set válidas.");
  }
  return number;
}

function parseSetScores(formData: FormData, bestOfSets: number) {
  if (bestOfSets !== 3 && bestOfSets !== 5) {
    throw new Error("La competición debe ser al mejor de 3 o de 5 sets.");
  }

  const targetSets = bestOfSets === 3 ? 2 : 3;
  const sets = Array.from({ length: bestOfSets }, (_, index) => {
    const homePoints = parsePointValue(formData.get(`set${index + 1}HomePoints`));
    const awayPoints = parsePointValue(formData.get(`set${index + 1}AwayPoints`));

    if (homePoints === null && awayPoints === null) return null;
    if (homePoints === null || awayPoints === null) {
      throw new Error("Completa los dos valores de cada set jugado.");
    }

    const winnerPoints = Math.max(homePoints, awayPoints);
    const pointDiff = Math.abs(homePoints - awayPoints);

    if (homePoints === awayPoints || winnerPoints < 11 || pointDiff < 2) {
      throw new Error("Cada set debe ganarse con al menos 11 puntos y 2 puntos de diferencia.");
    }

    return { setNumber: index + 1, homePoints, awayPoints };
  }).filter((set): set is { setNumber: number; homePoints: number; awayPoints: number } => Boolean(set));

  if (sets.length < targetSets || sets.length > bestOfSets) {
    throw new Error(`Un partido al mejor de ${bestOfSets} debe tener entre ${targetSets} y ${bestOfSets} sets.`);
  }

  let homeSets = 0;
  let awaySets = 0;
  for (const [index, set] of sets.entries()) {
    if (set.homePoints > set.awayPoints) homeSets += 1;
    if (set.awayPoints > set.homePoints) awaySets += 1;

    const isFinalSet = index === sets.length - 1;
    if (!isFinalSet && (homeSets === targetSets || awaySets === targetSets)) {
      throw new Error("No se pueden añadir sets después de que un jugador haya ganado el partido.");
    }
  }

  if (homeSets !== targetSets && awaySets !== targetSets) {
    throw new Error(`El resultado debe dejar un ganador con ${targetSets} sets.`);
  }

  return { sets, homeSets, awaySets };
}

function seededBracketPositions(bracketSize: number) {
  const positions = [
    0,
    bracketSize - 1,
    bracketSize / 2 - 1,
    bracketSize / 2,
    bracketSize / 4 - 1,
    bracketSize - bracketSize / 4,
    bracketSize / 4,
    bracketSize - bracketSize / 4 - 1
  ];

  return Array.from(new Set(positions.filter((position) => Number.isInteger(position) && position >= 0 && position < bracketSize)));
}

function opponentPosition(position: number) {
  return position % 2 === 0 ? position + 1 : position - 1;
}

function buildSeededBracketEntries<T extends { id: string }>(players: T[], seeds: Array<{ playerId: string; index: number }>, bracketSize: number) {
  const entries = Array<T | null>(bracketSize).fill(null);
  const seedPositions = seededBracketPositions(bracketSize);
  const reservedByes = new Set<number>();
  const seededPlayers = seeds
    .map((seed) => {
      const player = players.find((item) => item.id === seed.playerId);
      return player ? { seed, player } : null;
    })
    .filter(Boolean) as Array<{ seed: { playerId: string; index: number }; player: T }>;

  const placedSeedPositions: number[] = [];
  for (const { player } of seededPlayers) {
    const position = seedPositions.shift();
    if (position === undefined) break;
    entries[position] = player;
    placedSeedPositions.push(position);
  }

  let byeCount = Math.max(0, bracketSize - players.length);
  for (const position of placedSeedPositions) {
    if (byeCount === 0) break;
    const opponent = opponentPosition(position);
    if (opponent >= 0 && opponent < bracketSize && !entries[opponent] && !reservedByes.has(opponent)) {
      reservedByes.add(opponent);
      byeCount -= 1;
    }
  }

  const spreadPositions = seededBracketPositions(bracketSize)
    .flatMap((position) => [opponentPosition(position), position])
    .filter((position) => position >= 0 && position < bracketSize);
  for (const position of spreadPositions) {
    if (byeCount === 0) break;
    if (!entries[position] && !reservedByes.has(position)) {
      reservedByes.add(position);
      byeCount -= 1;
    }
  }

  const placedPlayerIds = new Set(entries.filter((player): player is T => Boolean(player)).map((player) => player.id));
  const remaining = shuffle(players.filter((player) => !placedPlayerIds.has(player.id)));
  for (let index = 0; index < entries.length; index += 1) {
    if (!entries[index] && !reservedByes.has(index)) {
      entries[index] = remaining.shift() ?? null;
    }
  }

  return entries;
}

function tournamentMatchDate(startsAt: Date | null, matchType: string, roundNumber: number, bracketPosition: number) {
  const date = new Date(startsAt ?? new Date());
  const dayOffset = Math.max(0, roundNumber - 1) + (matchType === "tournament_consolation" ? 1 : 0);
  date.setDate(date.getDate() + dayOffset);
  date.setHours(9 + ((bracketPosition - 1) % 6) * 2, 0, 0, 0);
  return date;
}

function playerSide(match: {
  homePlayerId: string | null;
  awayPlayerId: string | null;
  homePlayerNameAtMatchTime: string | null;
  awayPlayerNameAtMatchTime: string | null;
}, playerId: string | null) {
  if (!playerId) return null;
  if (match.homePlayerId === playerId) {
    return { playerId, playerName: match.homePlayerNameAtMatchTime };
  }
  if (match.awayPlayerId === playerId) {
    return { playerId, playerName: match.awayPlayerNameAtMatchTime };
  }
  return null;
}

async function setTournamentMatchSide({
  competitionId,
  competitionCategoryId,
  matchType,
  roundNumber,
  bracketPosition,
  side,
  playerId,
  playerName
}: {
  competitionId: string;
  competitionCategoryId: string;
  matchType: "tournament_knockout" | "tournament_consolation" | "tournament_third_place";
  roundNumber: number;
  bracketPosition: number;
  side: "home" | "away";
  playerId: string;
  playerName: string | null;
}) {
  const existing = await prisma.match.findFirst({
    where: { competitionId, competitionCategoryId, matchType, roundNumber, bracketPosition },
    select: { id: true }
  });
  const sideData = side === "home"
    ? { homePlayerId: playerId, homePlayerNameAtMatchTime: playerName }
    : { awayPlayerId: playerId, awayPlayerNameAtMatchTime: playerName };

  if (existing) {
    await prisma.match.update({ where: { id: existing.id }, data: sideData });
    return;
  }

  const competition = await prisma.competition.findUniqueOrThrow({
    where: { id: competitionId },
    select: { seasonId: true, startsAt: true }
  });

  await prisma.match.create({
    data: {
      seasonId: competition.seasonId,
      competitionId,
      competitionCategoryId,
      matchType,
      roundNumber,
      bracketPosition,
      scheduledAt: tournamentMatchDate(competition.startsAt, matchType, roundNumber, bracketPosition),
      status: "scheduled",
      ...sideData
    }
  });
}

async function advanceTournamentResult(matchId: string, winnerPlayerId: string | null) {
  const match = await prisma.match.findUniqueOrThrow({
    where: { id: matchId },
    select: {
      id: true,
      competitionId: true,
      competitionCategoryId: true,
      matchType: true,
      roundNumber: true,
      bracketPosition: true,
      homePlayerId: true,
      awayPlayerId: true,
      homePlayerNameAtMatchTime: true,
      awayPlayerNameAtMatchTime: true
    }
  });

  if (!winnerPlayerId || !match.roundNumber || !match.bracketPosition) return;
  if (match.matchType !== "tournament_knockout" && match.matchType !== "tournament_consolation") return;
  const progressionMatchType = match.matchType;

  const winner = playerSide(match, winnerPlayerId);
  const loserPlayerId = winnerPlayerId === match.homePlayerId ? match.awayPlayerId : match.homePlayerId;
  const loser = playerSide(match, loserPlayerId);
  if (!winner) return;

  const drawEntries = match.matchType === "tournament_knockout"
    ? await prisma.tournamentDrawEntry.findMany({
        where: { competitionCategoryId: match.competitionCategoryId, bracketType: "main" },
        select: { id: true }
      })
    : await prisma.tournamentDrawEntry.findMany({
        where: { competitionCategoryId: match.competitionCategoryId, bracketType: "consolation" },
        select: { id: true, playerId: true }
      });
  const bracketSize = drawEntries.length;
  const totalRounds = Math.ceil(Math.log2(Math.max(bracketSize, 2)));

  if (match.matchType === "tournament_knockout" && match.roundNumber === 1 && loser && bracketSize >= 8) {
    await prisma.tournamentDrawEntry.updateMany({
      where: {
        competitionCategoryId: match.competitionCategoryId,
        bracketType: "consolation",
        bracketPosition: match.bracketPosition
      },
      data: {
        playerId: loser.playerId,
        playerNameAtTime: loser.playerName,
        isBye: false
      }
    });

    const consolationPosition = match.bracketPosition;
    const siblingPosition = consolationPosition % 2 === 1 ? consolationPosition + 1 : consolationPosition - 1;
    const sibling = await prisma.tournamentDrawEntry.findFirst({
      where: {
        competitionCategoryId: match.competitionCategoryId,
        bracketType: "consolation",
        bracketPosition: siblingPosition,
        playerId: { not: null }
      }
    });

    if (sibling) {
      await setTournamentMatchSide({
        competitionId: match.competitionId,
        competitionCategoryId: match.competitionCategoryId,
        matchType: "tournament_consolation",
        roundNumber: 1,
        bracketPosition: Math.ceil(consolationPosition / 2),
        side: consolationPosition % 2 === 1 ? "home" : "away",
        playerId: loser.playerId,
        playerName: loser.playerName
      });
      await setTournamentMatchSide({
        competitionId: match.competitionId,
        competitionCategoryId: match.competitionCategoryId,
        matchType: "tournament_consolation",
        roundNumber: 1,
        bracketPosition: Math.ceil(consolationPosition / 2),
        side: siblingPosition % 2 === 1 ? "home" : "away",
        playerId: sibling.playerId!,
        playerName: sibling.playerNameAtTime
      });
    }
  }

  if (match.roundNumber < totalRounds) {
    await setTournamentMatchSide({
      competitionId: match.competitionId,
      competitionCategoryId: match.competitionCategoryId,
      matchType: progressionMatchType,
      roundNumber: match.roundNumber + 1,
      bracketPosition: Math.ceil(match.bracketPosition / 2),
      side: match.bracketPosition % 2 === 1 ? "home" : "away",
      playerId: winner.playerId,
      playerName: winner.playerName
    });
  }

  if (match.matchType === "tournament_knockout" && match.roundNumber === totalRounds - 1 && loser) {
    await setTournamentMatchSide({
      competitionId: match.competitionId,
      competitionCategoryId: match.competitionCategoryId,
      matchType: "tournament_third_place",
      roundNumber: totalRounds,
      bracketPosition: 1,
      side: match.bracketPosition % 2 === 1 ? "home" : "away",
      playerId: loser.playerId,
      playerName: loser.playerName
    });
  }
}

async function tournamentRankingScores(scope: "autonomic" | "state" | "psa", playerIds?: string[]) {
  const matches = await prisma.match.findMany({
    where: {
      status: "played",
      winnerPlayerId: { not: null },
      matchType: { in: ["tournament_knockout", "tournament_round_robin", "tournament_consolation", "tournament_third_place"] },
      competition: { rankingScope: scope },
      ...(playerIds?.length
        ? { OR: [{ homePlayerId: { in: playerIds } }, { awayPlayerId: { in: playerIds } }] }
        : {})
    },
    select: {
      homePlayerId: true,
      awayPlayerId: true,
      winnerPlayerId: true
    }
  });
  const scores = new Map<string, { points: number; played: number; won: number }>();
  const ensure = (playerId: string) => {
    const existing = scores.get(playerId) ?? { points: 0, played: 0, won: 0 };
    scores.set(playerId, existing);
    return existing;
  };

  for (const match of matches) {
    for (const playerId of [match.homePlayerId, match.awayPlayerId]) {
      if (!playerId || (playerIds?.length && !playerIds.includes(playerId))) continue;
      const score = ensure(playerId);
      score.played += 1;
      score.points += 2;
      if (match.winnerPlayerId === playerId) {
        score.won += 1;
        score.points += 10;
      }
    }
  }

  return scores;
}

async function saveTournamentSeeds(competitionCategoryId: string, playerIds: string[]) {
  if (playerIds.length > 8) {
    throw new Error("Selecciona como máximo 8 cabezas de serie por categoría.");
  }

  const competitionCategory = await prisma.competitionCategory.findUniqueOrThrow({
    where: { id: competitionCategoryId },
    include: { participants: { include: { player: true } } }
  });
  const participantPlayers = competitionCategory.participants.flatMap((participant) => participant.player ? [participant.player] : []);
  const participantIds = new Set(participantPlayers.map((player) => player.id));
  const selectedIds = playerIds.filter((playerId, index) => participantIds.has(playerId) && playerIds.indexOf(playerId) === index).slice(0, 8);

  await prisma.$transaction([
    prisma.tournamentSeed.deleteMany({ where: { competitionCategoryId } }),
    ...(selectedIds.length
      ? [prisma.tournamentSeed.createMany({
          data: selectedIds.map((playerId, index) => {
            const player = participantPlayers.find((item) => item.id === playerId)!;
            return {
              competitionCategoryId,
              playerId,
              playerNameAtTime: `${player.firstName} ${player.lastName}`,
              seedNumber: index + 1,
              suggested: false
            };
          })
        })]
      : [])
  ]);

  revalidatePath(`/tournaments/${competitionCategory.competitionId}`);
  revalidatePath(`/tournaments/${competitionCategory.competitionId}/edit`);
}

async function canManageClub(userId: string, clubId?: string | null) {
  if (!clubId) {
    return false;
  }

  const club = await prisma.club.findFirst({
    where: { id: clubId, managerUserId: userId },
    select: { id: true }
  });

  return Boolean(club);
}

async function assertCanEditMatchResult(matchId: string, currentUser: Awaited<ReturnType<typeof getCurrentUser>>) {
  if (!currentUser) {
    throw new Error("Debes iniciar sesión para modificar resultados.");
  }

  if (hasRole(currentUser, "admin")) {
    return;
  }

  const match = await prisma.match.findUniqueOrThrow({
    where: { id: matchId }
  });
  const competition = await prisma.competition.findUniqueOrThrow({
    where: { id: match.competitionId }
  });
  const currentPlayer = await prisma.player.findUnique({
    where: { userId: currentUser.id },
    select: { id: true }
  });
  const isParticipant = Boolean(
    currentPlayer?.id &&
      (match.homePlayerId === currentPlayer.id || match.awayPlayerId === currentPlayer.id)
  );

  if (competition.type === "tournament") {
    if (await canManageClub(currentUser.id, competition.hostClubId)) {
      return;
    }
    throw new Error("Solo el manager del club organizador puede modificar resultados de torneo.");
  }

  const managesHomeClub = await canManageClub(currentUser.id, match.homeClubIdAtMatchTime);
  const managesAwayClub = await canManageClub(currentUser.id, match.awayClubIdAtMatchTime);

  if (isParticipant || managesHomeClub || managesAwayClub) {
    return;
  }

  throw new Error("No tienes permisos para modificar este resultado.");
}

async function assertCanEditTournament(competitionId: string, currentUser: Awaited<ReturnType<typeof getCurrentUser>>) {
  const competition = await prisma.competition.findUniqueOrThrow({
    where: { id: competitionId },
    include: { hostClub: true }
  });
  const isAdmin = hasRole(currentUser, "admin");
  if (!isAdmin && competition.hostClub?.managerUserId !== currentUser?.id) {
    throw new Error("Solo el manager del club organizador o un admin puede modificar este torneo.");
  }
  return competition;
}

async function registerTournamentPlayer(competitionCategoryId: string, playerId: string, createdByUserId: string) {
  const competitionCategory = await prisma.competitionCategory.findUniqueOrThrow({
    where: { id: competitionCategoryId },
    include: { competition: true }
  });

  if (competitionCategory.competition.registrationDeadline && competitionCategory.competition.registrationDeadline < new Date()) {
    throw new Error("La inscripción ya está cerrada.");
  }

  const player = await prisma.player.findUniqueOrThrow({
    where: { id: playerId },
    include: {
      memberships: {
        where: { toDate: null },
        include: { club: true },
        orderBy: { fromDate: "desc" },
        take: 1
      }
    }
  });
  const currentMembership = player.memberships[0];

  await prisma.$transaction([
    prisma.competitionParticipant.upsert({
      where: {
        competitionCategoryId_playerId: {
          competitionCategoryId,
          playerId
        }
      },
      update: {},
      create: {
        competitionId: competitionCategory.competitionId,
        competitionCategoryId,
        playerId,
        createdByUserId
      }
    }),
    prisma.tournamentRegistration.upsert({
      where: {
        competitionCategoryId_playerId: {
          competitionCategoryId,
          playerId
        }
      },
      update: {
        clubIdAtRegistration: currentMembership?.clubId ?? null,
        clubNameAtRegistration: currentMembership?.club.name ?? null,
        status: "accepted"
      },
      create: {
        competitionCategoryId,
        playerId,
        clubIdAtRegistration: currentMembership?.clubId ?? null,
        playerNameAtRegistration: `${player.firstName} ${player.lastName}`,
        clubNameAtRegistration: currentMembership?.club.name ?? null,
        status: "accepted"
      }
    })
  ]);

  revalidatePath(`/tournaments/${competitionCategory.competitionId}`);
  revalidatePath(`/tournaments/${competitionCategory.competitionId}/edit`);
}

export async function savePlayerAction(formData: FormData) {
  const currentUser = await requireUser();
  const isAdmin = hasRole(currentUser, "admin");
  const uploadedProfilePhotoUrl = await readProfilePhoto(formData);
  const parsed = playerSchema.parse({
    playerId: textValue(formData.get("playerId")),
    firstName: textValue(formData.get("firstName")),
    lastName: textValue(formData.get("lastName")),
    email: textValue(formData.get("email"))?.toLowerCase(),
    phone: textValue(formData.get("phone")),
    emailVerified: formData.get("emailVerified") === "on",
    preferredLocale: textValue(formData.get("preferredLocale")) ?? "es",
    gender: textValue(formData.get("gender")) ?? "not_specified",
    dominantHand: textValue(formData.get("dominantHand")) ?? "not_specified",
    heightCm: textValue(formData.get("heightCm")) ?? "",
    weightKg: textValue(formData.get("weightKg")) ?? "",
    racketBrand: textValue(formData.get("racketBrand")),
    showContactPublic: formData.get("showContactPublic") === "on",
    showPhysicalPublic: formData.get("showPhysicalPublic") === "on",
    receivesMatchCommunications: formData.get("receivesMatchCommunications") === "on",
    clubId: textValue(formData.get("clubId")) ?? "",
    profilePhotoUrl: uploadedProfilePhotoUrl ?? textValue(formData.get("profilePhotoUrl"))
  });

  if (!isAdmin) {
    const ownPlayer = await prisma.player.findUnique({
      where: { userId: currentUser.id }
    });

    if (parsed.playerId && ownPlayer?.id !== parsed.playerId) {
      throw new Error("Solo puedes modificar tu propio perfil.");
    }

    if (!parsed.playerId && ownPlayer) {
      throw new Error("Tu usuario ya tiene un perfil de jugador.");
    }
  }

  const displayName = `${parsed.firstName} ${parsed.lastName}`;
  const user = isAdmin
    ? await prisma.user.upsert({
        where: { email: parsed.email },
        update: {
          displayName,
          phone: parsed.phone,
          emailVerified: parsed.emailVerified,
          preferredLocale: parsed.preferredLocale
        },
        create: {
          firebaseUid: `local:${parsed.email}`,
          email: parsed.email,
          displayName,
          phone: parsed.phone,
          emailVerified: parsed.emailVerified,
          preferredLocale: parsed.preferredLocale
        }
      })
    : await prisma.user.update({
        where: { id: currentUser.id },
        data: {
          displayName,
          phone: parsed.phone,
          preferredLocale: parsed.preferredLocale
        }
      });

  await ensureCredential(user.id);
  await prisma.userRoleAssignment.upsert({
    where: { userId_role: { userId: user.id, role: "player" } },
    update: {},
    create: { userId: user.id, role: "player" }
  });

  const player = parsed.playerId
    ? await prisma.player.update({
        where: { id: parsed.playerId },
        data: {
          userId: user.id,
          firstName: parsed.firstName,
          lastName: parsed.lastName,
          gender: parsed.gender,
          dominantHand: parsed.dominantHand,
          heightCm: parsed.heightCm || null,
          weightKg: parsed.weightKg || null,
          racketBrand: parsed.racketBrand,
          profilePhotoUrl: parsed.profilePhotoUrl || null,
          genericProfileVariant: genericProfileVariant(parsed.gender),
          showContactPublic: parsed.showContactPublic,
          showPhysicalPublic: parsed.showPhysicalPublic,
          receivesMatchCommunications: parsed.receivesMatchCommunications
        }
      })
    : await prisma.player.create({
        data: {
          userId: user.id,
          firstName: parsed.firstName,
          lastName: parsed.lastName,
          gender: parsed.gender,
          dominantHand: parsed.dominantHand,
          heightCm: parsed.heightCm || null,
          weightKg: parsed.weightKg || null,
          racketBrand: parsed.racketBrand,
          profilePhotoUrl: parsed.profilePhotoUrl || null,
          genericProfileVariant: genericProfileVariant(parsed.gender),
          showContactPublic: parsed.showContactPublic,
          showPhysicalPublic: parsed.showPhysicalPublic,
          receivesMatchCommunications: parsed.receivesMatchCommunications
        }
      });

  if (isAdmin && parsed.clubId) {
    const season = await getDefaultSeason();
    const club = await prisma.club.findUniqueOrThrow({ where: { id: parsed.clubId } });
    await prisma.playerClubMembership.upsert({
      where: {
        playerId_clubId_seasonId: {
          playerId: player.id,
          clubId: club.id,
          seasonId: season.id
        }
      },
      update: { clubNameAtThatTime: club.name },
      create: {
        playerId: player.id,
        clubId: club.id,
        seasonId: season.id,
        clubNameAtThatTime: club.name,
        fromDate: season.startsAt
      }
    });
  }

  revalidatePath("/admin/players");
  revalidatePath(`/players/${player.id}`);
  revalidatePath(`/players/${player.id}/edit`);
}

export async function saveClubAction(formData: FormData) {
  const currentUser = await requireUser();
  const isAdmin = hasRole(currentUser, "admin");
  const parsed = clubSchema.parse({
    clubId: textValue(formData.get("clubId")),
    name: textValue(formData.get("name")),
    city: textValue(formData.get("city")),
    province: textValue(formData.get("province")),
    address: textValue(formData.get("address")),
    websiteUrl: textValue(formData.get("websiteUrl")) ?? "",
    showContactPublic: formData.get("showContactPublic") === "on",
    managerUserId: textValue(formData.get("managerUserId")) ?? ""
  });

  if (!isAdmin) {
    if (!parsed.clubId) {
      throw new Error("Solo un admin puede crear clubes.");
    }

    const managedClub = await prisma.club.findUniqueOrThrow({
      where: { id: parsed.clubId }
    });

    if (managedClub.managerUserId !== currentUser.id) {
      throw new Error("Solo puedes modificar el club que administras.");
    }
  }

  const club = parsed.clubId
    ? await prisma.club.update({
        where: { id: parsed.clubId },
        data: {
          name: parsed.name,
          city: parsed.city,
          province: parsed.province,
          address: parsed.address,
          websiteUrl: parsed.websiteUrl || null,
          showContactPublic: parsed.showContactPublic,
          managerUserId: isAdmin ? parsed.managerUserId || null : undefined
        }
      })
    : await prisma.club.create({
        data: {
          name: parsed.name,
          city: parsed.city,
          province: parsed.province,
          address: parsed.address,
          websiteUrl: parsed.websiteUrl || null,
          showContactPublic: parsed.showContactPublic,
          managerUserId: parsed.managerUserId || null
        }
      });

  if (isAdmin && parsed.managerUserId) {
    await prisma.userRoleAssignment.upsert({
      where: { userId_role: { userId: parsed.managerUserId, role: "manager" } },
      update: {},
      create: { userId: parsed.managerUserId, role: "manager" }
    });
  }

  const season = await getDefaultSeason();
  await prisma.$executeRaw`
    INSERT INTO club_season_profiles (club_id, season_id, display_name)
    VALUES (${club.id}::uuid, ${season.id}::uuid, ${club.name})
    ON CONFLICT (club_id, season_id)
    DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = now()
  `;

  revalidatePath("/admin/clubs");
}

export async function saveLeagueAction(formData: FormData) {
  await requireAdmin();
  const parsed = competitionSchema.parse({
    competitionId: textValue(formData.get("competitionId")),
    name: textValue(formData.get("name")),
    description: textValue(formData.get("description")),
    type: textValue(formData.get("type")) ?? "individual_league",
    bestOfSets: textValue(formData.get("bestOfSets")) ?? "5",
    registrationDeadline: textValue(formData.get("registrationDeadline")),
    startsAt: textValue(formData.get("startsAt")),
    endsAt: textValue(formData.get("endsAt")),
    participantIds: toArray(formData, "participantIds")
  });

  const season = await getDefaultSeason();
  const category = await getDefaultCategory();
  const competition = parsed.competitionId
    ? await prisma.competition.update({
        where: { id: parsed.competitionId },
        data: {
          name: parsed.name,
          description: parsed.description,
          type: parsed.type,
          bestOfSets: parsed.bestOfSets,
          registrationDeadline: new Date(parsed.registrationDeadline),
          startsAt: new Date(parsed.startsAt),
          endsAt: new Date(parsed.endsAt)
        }
      })
    : await prisma.competition.create({
        data: {
          seasonId: season.id,
          name: parsed.name,
          description: parsed.description,
          type: parsed.type,
          bestOfSets: parsed.bestOfSets,
          status: "draft",
          registrationDeadline: new Date(parsed.registrationDeadline),
          startsAt: new Date(parsed.startsAt),
          endsAt: new Date(parsed.endsAt)
        }
      });

  const competitionCategory = await prisma.competitionCategory.upsert({
    where: {
      competitionId_categoryId: {
        competitionId: competition.id,
        categoryId: category.id
      }
    },
    update: { format: "league" },
    create: {
      competitionId: competition.id,
      categoryId: category.id,
      format: "league"
    }
  });

  await prisma.competitionParticipant.deleteMany({
    where: { competitionCategoryId: competitionCategory.id }
  });
  await prisma.match.deleteMany({ where: { competitionId: competition.id } });
  await prisma.teamTie.deleteMany({ where: { competitionId: competition.id } });

  if (parsed.type === "individual_league") {
    const players = await prisma.player.findMany({
      where: { id: { in: parsed.participantIds } },
      include: { memberships: { include: { club: true }, take: 1 } }
    });

    await prisma.competitionParticipant.createMany({
      data: players.map((player) => ({
        competitionId: competition.id,
        competitionCategoryId: competitionCategory.id,
        playerId: player.id
      }))
    });

    const rounds = generateRoundRobin(shuffle(players));
    await prisma.match.createMany({
      data: rounds.flatMap((round, roundIndex) =>
        round.map(([home, away], matchIndex) => ({
          seasonId: season.id,
          competitionId: competition.id,
          competitionCategoryId: competitionCategory.id,
          matchType: "individual_league",
          roundNumber: roundIndex + 1,
          matchOrder: matchIndex + 1,
          status: "scheduled",
          homePlayerId: home.id,
          awayPlayerId: away.id,
          homeClubIdAtMatchTime: home.memberships[0]?.clubId ?? null,
          awayClubIdAtMatchTime: away.memberships[0]?.clubId ?? null,
          homePlayerNameAtMatchTime: `${home.firstName} ${home.lastName}`,
          awayPlayerNameAtMatchTime: `${away.firstName} ${away.lastName}`,
          homeClubNameAtMatchTime: home.memberships[0]?.club.name ?? null,
          awayClubNameAtMatchTime: away.memberships[0]?.club.name ?? null
        }))
      )
    });
  } else {
    const clubs = await prisma.club.findMany({ where: { id: { in: parsed.participantIds } } });
    await prisma.competitionParticipant.createMany({
      data: clubs.map((club) => ({
        competitionId: competition.id,
        competitionCategoryId: competitionCategory.id,
        clubId: club.id
      }))
    });

    const teams = await Promise.all(
      clubs.map((club) =>
        prisma.team.upsert({
          where: {
            clubId_seasonId_categoryId_name: {
              clubId: club.id,
              seasonId: season.id,
              categoryId: category.id,
              name: `${club.name} General`
            }
          },
          update: { clubNameAtCreation: club.name },
          create: {
            clubId: club.id,
            seasonId: season.id,
            categoryId: category.id,
            name: `${club.name} General`,
            clubNameAtCreation: club.name
          }
        })
      )
    );

    const rounds = generateRoundRobin(shuffle(teams));
    await prisma.teamTie.createMany({
      data: rounds.flatMap((round, roundIndex) =>
        round.map(([home, away]) => ({
          seasonId: season.id,
          competitionId: competition.id,
          competitionCategoryId: competitionCategory.id,
          homeTeamId: home.id,
          awayTeamId: away.id,
          status: "scheduled",
          homeTeamNameAtTime: home.name,
          awayTeamNameAtTime: away.name,
          homeClubNameAtTime: home.clubNameAtCreation,
          awayClubNameAtTime: away.clubNameAtCreation
        }))
      )
    });
  }

  revalidatePath("/admin/leagues");
}

export async function saveTournamentAction(formData: FormData) {
  const currentUser = await requireUser();
  const isAdmin = hasRole(currentUser, "admin");
  const shouldGenerateDraw = formData.get("mode")?.toString() === "generate";
  const parsed = tournamentSchema.parse({
    competitionId: textValue(formData.get("competitionId")),
    name: textValue(formData.get("name")),
    description: textValue(formData.get("description")),
    hostClubId: textValue(formData.get("hostClubId")),
    refereeName: textValue(formData.get("refereeName")),
    rankingScope: textValue(formData.get("rankingScope")) ?? "none",
    bestOfSets: textValue(formData.get("bestOfSets")) ?? "5",
    registrationDeadline: textValue(formData.get("registrationDeadline")),
    startsAt: textValue(formData.get("startsAt")),
    endsAt: textValue(formData.get("endsAt")),
    categoryIds: toArray(formData, "categoryIds"),
    participantIds: toArray(formData, "participantIds"),
    seedPlayerIds: toArray(formData, "seedPlayerIds"),
    seedEntries: toArray(formData, "seedEntries")
  });

  if (!isAdmin) {
    const managedClub = await prisma.club.findUniqueOrThrow({
      where: { id: parsed.hostClubId }
    });

    if (managedClub.managerUserId !== currentUser.id) {
      throw new Error("Solo puedes crear o modificar torneos de tu club.");
    }

    if (parsed.competitionId) {
      const existing = await prisma.competition.findUniqueOrThrow({
        where: { id: parsed.competitionId }
      });

      if (existing.hostClubId !== parsed.hostClubId) {
        throw new Error("No puedes mover un torneo a otro club.");
      }
    }
  }

  const season = await getDefaultSeason();
  const defaultCategory = await getDefaultCategory();
  const categoryIds = parsed.categoryIds.length ? parsed.categoryIds : [defaultCategory.id];
  const competition = parsed.competitionId
    ? await prisma.competition.update({
        where: { id: parsed.competitionId },
        data: {
          name: parsed.name,
          description: parsed.description,
          hostClubId: parsed.hostClubId,
          refereeName: parsed.refereeName,
          rankingScope: parsed.rankingScope,
          bestOfSets: parsed.bestOfSets,
          registrationDeadline: new Date(parsed.registrationDeadline),
          startsAt: new Date(parsed.startsAt),
          endsAt: new Date(parsed.endsAt)
        }
      })
    : await prisma.competition.create({
        data: {
          seasonId: season.id,
          type: "tournament",
          status: "registration_open",
          name: parsed.name,
          description: parsed.description,
          hostClubId: parsed.hostClubId,
          refereeName: parsed.refereeName,
          rankingScope: parsed.rankingScope,
          bestOfSets: parsed.bestOfSets,
          registrationDeadline: new Date(parsed.registrationDeadline),
          startsAt: new Date(parsed.startsAt),
          endsAt: new Date(parsed.endsAt)
        }
      });

  await prisma.competitionCategory.deleteMany({
    where: {
      competitionId: competition.id,
      categoryId: { notIn: categoryIds }
    }
  });

  await Promise.all(
    categoryIds.map((categoryId) =>
      prisma.competitionCategory.upsert({
        where: {
          competitionId_categoryId: {
            competitionId: competition.id,
            categoryId
          }
        },
        update: {},
        create: {
          competitionId: competition.id,
          categoryId,
          format: "knockout"
        }
      })
    )
  );

  const competitionCategories = await prisma.competitionCategory.findMany({
    where: { competitionId: competition.id },
    orderBy: { createdAt: "asc" }
  });

  if (parsed.seedEntries.length) {
    for (const competitionCategory of competitionCategories) {
      const seedPlayerIds = parsed.seedEntries
        .map((entry) => {
          const [categoryId, playerId] = entry.split(":");
          return categoryId === competitionCategory.id ? playerId : null;
        })
        .filter(Boolean) as string[];
      await saveTournamentSeeds(competitionCategory.id, seedPlayerIds);
    }
  }

  if (!shouldGenerateDraw) {
    revalidatePath("/manager/tournaments");
    revalidatePath(`/tournaments/${competition.id}`);
    revalidatePath(`/tournaments/${competition.id}/edit`);
    return;
  }

  for (const competitionCategory of competitionCategories) {
    const participants = await prisma.competitionParticipant.findMany({
      where: { competitionCategoryId: competitionCategory.id, playerId: { not: null } },
      include: { player: true },
      orderBy: { createdAt: "asc" }
    });
    const players = participants.flatMap((participant) => participant.player ? [participant.player] : []);
    const storedSeeds = await prisma.tournamentSeed.findMany({
      where: { competitionCategoryId: competitionCategory.id },
      orderBy: { seedNumber: "asc" }
    });
    const seeds = storedSeeds
      .map((seed, index) => players.find((player) => player.id === seed.playerId) && { playerId: seed.playerId, index })
      .filter(Boolean) as Array<{ playerId: string; index: number }>;
    const format = players.length < 8 ? "round_robin" : "knockout";

    await prisma.$transaction([
      prisma.tournamentSeed.deleteMany({ where: { competitionCategoryId: competitionCategory.id } }),
      prisma.tournamentDrawEntry.deleteMany({ where: { competitionCategoryId: competitionCategory.id } }),
      prisma.match.deleteMany({ where: { competitionId: competition.id, competitionCategoryId: competitionCategory.id } }),
      prisma.competitionCategory.update({
        where: { id: competitionCategory.id },
        data: { format }
      })
    ]);

    if (seeds.length > 0) {
      await prisma.tournamentSeed.createMany({
        data: seeds.map((seed) => {
          const player = players.find((item) => item.id === seed.playerId)!;
          return {
            competitionCategoryId: competitionCategory.id,
            playerId: player.id,
            playerNameAtTime: `${player.firstName} ${player.lastName}`,
            seedNumber: seed.index + 1,
            suggested: false
          };
        })
      });
    }

    if (players.length < 2) continue;

    if (format === "round_robin") {
      const rounds = generateRoundRobin(shuffle(players));
      await prisma.match.createMany({
        data: rounds.flatMap((round, roundIndex) =>
          round.map(([home, away], matchIndex) => ({
            seasonId: season.id,
            competitionId: competition.id,
            competitionCategoryId: competitionCategory.id,
            matchType: "tournament_round_robin" as const,
            roundNumber: roundIndex + 1,
            matchOrder: matchIndex + 1,
            scheduledAt: tournamentMatchDate(competition.startsAt, "tournament_round_robin", roundIndex + 1, matchIndex + 1),
            status: "scheduled" as const,
            homePlayerId: home.id,
            awayPlayerId: away.id,
            homePlayerNameAtMatchTime: `${home.firstName} ${home.lastName}`,
            awayPlayerNameAtMatchTime: `${away.firstName} ${away.lastName}`
          }))
        )
      });
    } else {
      const bracketSize = nextPowerOfTwo(players.length);
      const entries = buildSeededBracketEntries(players, seeds, bracketSize);

      await prisma.tournamentDrawEntry.createMany({
        data: entries.map((player, index) => ({
          competitionCategoryId: competitionCategory.id,
          bracketType: "main",
          playerId: player?.id ?? null,
          playerNameAtTime: player ? `${player.firstName} ${player.lastName}` : null,
          seedNumber: player
            ? ((seeds.find((seed) => seed.playerId === player.id)?.index ?? -1) + 1 || null)
            : null,
          bracketPosition: index + 1,
          isBye: !player
        }))
      });

      if (bracketSize >= 8) {
        await prisma.tournamentDrawEntry.createMany({
          data: Array.from({ length: bracketSize / 2 }, (_, index) => ({
            competitionCategoryId: competitionCategory.id,
            bracketType: "consolation",
            playerId: null,
            playerNameAtTime: `Perdedor partido ${index + 1}`,
            bracketPosition: index + 1,
            isBye: false
          }))
        });
      }

      await prisma.match.createMany({
        data: Array.from({ length: bracketSize / 2 }, (_, index) => {
          const home = entries[index * 2];
          const away = entries[index * 2 + 1];
          return {
            seasonId: season.id,
            competitionId: competition.id,
            competitionCategoryId: competitionCategory.id,
            matchType: "tournament_knockout" as const,
            roundNumber: 1,
            bracketPosition: index + 1,
            scheduledAt: tournamentMatchDate(competition.startsAt, "tournament_knockout", 1, index + 1),
            status: home && away ? "scheduled" as const : "bye" as const,
            homePlayerId: home?.id ?? null,
            awayPlayerId: away?.id ?? null,
            winnerPlayerId: home && !away ? home.id : !home && away ? away.id : null,
            homePlayerNameAtMatchTime: home ? `${home.firstName} ${home.lastName}` : null,
            awayPlayerNameAtMatchTime: away ? `${away.firstName} ${away.lastName}` : null
          };
        })
      });

      if (bracketSize >= 4) {
        await prisma.match.create({
          data: {
            seasonId: season.id,
            competitionId: competition.id,
            competitionCategoryId: competitionCategory.id,
            matchType: "tournament_third_place" as const,
            roundNumber: Math.ceil(Math.log2(bracketSize)),
            bracketPosition: 1,
            scheduledAt: tournamentMatchDate(competition.startsAt, "tournament_third_place", Math.ceil(Math.log2(bracketSize)), 1),
            status: "scheduled" as const
          }
        });
      }
    }
  }

  revalidatePath("/manager/tournaments");
  revalidatePath(`/tournaments/${competition.id}`);
  revalidatePath(`/tournaments/${competition.id}/edit`);
}

export async function registerSelfForTournamentAction(formData: FormData) {
  const currentUser = await requireUser();
  const parsed = tournamentRegistrationSchema.parse({
    competitionCategoryId: textValue(formData.get("competitionCategoryId"))
  });
  const player = await prisma.player.findUnique({
    where: { userId: currentUser.id },
    select: { id: true }
  });

  if (!player) {
    throw new Error("Debes tener perfil de jugador para inscribirte.");
  }

  await registerTournamentPlayer(parsed.competitionCategoryId, player.id, currentUser.id);
}

export async function registerPlayerForTournamentAction(formData: FormData) {
  const currentUser = await requireUser();
  const parsed = tournamentRegistrationSchema.parse({
    competitionCategoryId: textValue(formData.get("competitionCategoryId")),
    playerId: textValue(formData.get("playerId"))
  });
  const competitionCategory = await prisma.competitionCategory.findUniqueOrThrow({
    where: { id: parsed.competitionCategoryId },
    select: { competitionId: true }
  });
  await assertCanEditTournament(competitionCategory.competitionId, currentUser);

  if (!parsed.playerId) {
    throw new Error("Selecciona un jugador.");
  }

  await registerTournamentPlayer(parsed.competitionCategoryId, parsed.playerId, currentUser.id);
}

export async function saveTournamentSeedsAction(formData: FormData) {
  const currentUser = await requireUser();
  const parsed = tournamentSeedsSchema.parse({
    competitionCategoryId: textValue(formData.get("competitionCategoryId")),
    seedPlayerIds: toArray(formData, "seedPlayerIds")
  });
  const competitionCategory = await prisma.competitionCategory.findUniqueOrThrow({
    where: { id: parsed.competitionCategoryId },
    select: { competitionId: true }
  });

  await assertCanEditTournament(competitionCategory.competitionId, currentUser);
  await saveTournamentSeeds(parsed.competitionCategoryId, parsed.seedPlayerIds);
}

export async function suggestTournamentSeedsAction(formData: FormData) {
  const currentUser = await requireUser();
  const parsed = tournamentSeedsSchema.parse({
    competitionCategoryId: textValue(formData.get("competitionCategoryId")),
    seedPlayerIds: []
  });
  const competitionCategory = await prisma.competitionCategory.findUniqueOrThrow({
    where: { id: parsed.competitionCategoryId },
    include: {
      competition: true,
      participants: { include: { player: true } }
    }
  });

  await assertCanEditTournament(competitionCategory.competitionId, currentUser);

  if (competitionCategory.competition.rankingScope === "none") {
    throw new Error("Selecciona primero un tipo de ránking para el torneo.");
  }

  const players = competitionCategory.participants.flatMap((participant) => participant.player ? [participant.player] : []);
  const scores = await tournamentRankingScores(competitionCategory.competition.rankingScope, players.map((player) => player.id));
  const seedPlayerIds = players
    .map((player) => ({ player, score: scores.get(player.id) ?? { points: 0, played: 0, won: 0 } }))
    .sort((left, right) =>
      right.score.points - left.score.points ||
      right.score.won - left.score.won ||
      right.score.played - left.score.played ||
      left.player.lastName.localeCompare(right.player.lastName) ||
      left.player.firstName.localeCompare(right.player.firstName)
    )
    .slice(0, Math.min(8, players.length))
    .map(({ player }) => player.id);

  await saveTournamentSeeds(parsed.competitionCategoryId, seedPlayerIds);
}

export async function saveTeamAction(formData: FormData) {
  const currentUser = await requireUser();
  const isAdmin = hasRole(currentUser, "admin");
  const parsed = teamSchema.parse({
    teamId: textValue(formData.get("teamId")),
    name: textValue(formData.get("name")),
    showRosterPublic: formData.get("showRosterPublic") === "on"
  });
  const team = await prisma.team.findUniqueOrThrow({
    where: { id: parsed.teamId },
    include: { club: true }
  });

  if (!isAdmin && team.club.managerUserId !== currentUser.id) {
    throw new Error("Solo puedes modificar equipos de tu club.");
  }

  await prisma.team.update({
    where: { id: parsed.teamId },
    data: {
      name: parsed.name,
      showRosterPublic: parsed.showRosterPublic
    }
  });

  revalidatePath(`/teams/${parsed.teamId}`);
}

export async function saveMatchResultAction(formData: FormData) {
  const currentUser = await requireUser();
  const parsed = matchResultSchema.parse({
    matchId: textValue(formData.get("matchId"))
  });

  await assertCanEditMatchResult(parsed.matchId, currentUser);

  const match = await prisma.match.findUniqueOrThrow({
    where: { id: parsed.matchId },
    select: {
      id: true,
      competitionId: true,
      homePlayerId: true,
      awayPlayerId: true,
      competition: { select: { bestOfSets: true } }
    }
  });

  const { sets, homeSets, awaySets } = parseSetScores(formData, match.competition.bestOfSets);
  const winnerPlayerId = homeSets > awaySets ? match.homePlayerId : match.awayPlayerId;

  await prisma.$transaction([
    prisma.matchSet.deleteMany({ where: { matchId: match.id } }),
    prisma.match.update({
      where: { id: match.id },
      data: {
        status: "played",
        playedAt: new Date(),
        winnerPlayerId
      }
    }),
    prisma.matchSet.createMany({
      data: sets.map((set) => ({ ...set, matchId: match.id }))
    })
  ]);

  await advanceTournamentResult(match.id, winnerPlayerId);

  revalidatePath(`/leagues/${match.competitionId}`);
  revalidatePath(`/leagues/${match.competitionId}/edit`);
  revalidatePath(`/tournaments/${match.competitionId}`);
  revalidatePath(`/tournaments/${match.competitionId}/edit`);
}

export async function removePlayerFromClubAction(formData: FormData) {
  const currentUser = await requireUser();
  const isAdmin = hasRole(currentUser, "admin");
  const parsed = removeClubPlayerSchema.parse({
    membershipId: textValue(formData.get("membershipId")),
    clubId: textValue(formData.get("clubId"))
  });
  const membership = await prisma.playerClubMembership.findUniqueOrThrow({
    where: { id: parsed.membershipId },
    include: { club: true }
  });

  if (membership.clubId !== parsed.clubId) {
    throw new Error("La pertenencia no corresponde a este club.");
  }

  if (!isAdmin && membership.club.managerUserId !== currentUser.id) {
    throw new Error("Solo puedes dar de baja jugadores de tu club.");
  }

  await prisma.playerClubMembership.update({
    where: { id: membership.id },
    data: { toDate: new Date() }
  });

  revalidatePath(`/clubs/${parsed.clubId}`);
  revalidatePath(`/clubs/${parsed.clubId}/edit`);
}
