"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/src/lib/auth";
import {
  addDaysToCourtDateKey,
  courtBookingHourMinute,
  courtDateKey,
  courtLocalDateTimeToUtc,
  courtWeekStart
} from "@/src/lib/court-booking-time";
import { featureKeys, isFeatureEnabled } from "@/src/lib/features";
import { clubGeocodingQuery, geocodeClubAddress } from "@/src/lib/geocoding";
import { getDictionary } from "@/src/lib/i18n";
import { appBaseUrl, sendTransactionalEmail } from "@/src/lib/email";
import { prisma } from "@/src/lib/prisma";
import { rankingCodeValues, rankingScopeForCode } from "@/src/lib/ranking-codes";
import { generateRoundRobin, nextPowerOfTwo, shuffle } from "@/src/lib/schedule";
import { getTournamentRankingRows } from "@/src/lib/tournament-rankings";

const testPassword = "TestUser1234";

const playerSchema = z.object({
  playerId: z.string().uuid().optional().or(z.literal("")),
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  emailVerified: z.coerce.boolean().default(false),
  preferredLocale: z.enum(["ca", "es", "en"]).default("es"),
  gender: z.enum(["male", "female", "other", "not_specified"]),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
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

const playerPasswordSchema = z.object({
  playerId: z.string().uuid(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8, "La nueva contraseña debe tener al menos 8 caracteres."),
  confirmPassword: z.string().min(8)
}).refine((value) => value.newPassword === value.confirmPassword, {
  message: "Las contraseñas no coinciden.",
  path: ["confirmPassword"]
});

const userOperationalRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["player", "manager"])
});

const userSuspensionSchema = z.object({
  userId: z.string().uuid(),
  action: z.enum(["suspend", "reactivate"]),
  reason: z.string().max(500).optional()
});

const playerLinkRequestSchema = z.object({
  requestId: z.string().uuid(),
  action: z.enum(["approve", "reject"])
});

const playerMergeSchema = z.object({
  primaryPlayerId: z.string().uuid(),
  duplicatePlayerId: z.string().uuid()
});

const clubJoinRequestSchema = z.object({
  playerId: z.string().uuid(),
  clubId: z.string().uuid()
});

const clubJoinReviewSchema = z.object({
  requestId: z.string().uuid(),
  action: z.enum(["accept", "reject"])
});

const clubSchema = z.object({
  clubId: z.string().uuid().optional().or(z.literal("")),
  name: z.string().min(3),
  city: z.string().optional(),
  province: z.string().optional(),
  address: z.string().optional(),
  postalCode: z.string().max(16).optional(),
  availableCourts: z.coerce.number().int().min(0).max(99).default(0),
  phone: z.string().optional(),
  managesCourtBookings: z.coerce.boolean().default(false),
  closedDays: z.string().optional(),
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
  matchFrequency: z.enum(["weekly", "biweekly"]).default("biweekly"),
  preferredMatchWeekday: z.coerce.number().int().min(1).max(7).optional().or(z.literal("")),
  hostClubId: z.string().uuid().optional().or(z.literal("")),
  participantIds: z.array(z.string().uuid()).default([])
});

const tournamentSchema = z.object({
  competitionId: z.string().uuid().optional().or(z.literal("")),
  name: z.string().min(3),
  description: z.string().optional(),
  posterUrl: z.string().optional(),
  hostClubId: z.string().uuid(),
  refereeName: z.string().optional(),
  rankingCode: z.enum(rankingCodeValues).default("none"),
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

const featureSettingsSchema = z.object({
  enabledFeatures: z.array(z.enum(featureKeys)).default([])
});

const courtReservationSchema = z.object({
  clubId: z.string().uuid(),
  courtNumber: z.coerce.number().int().min(1).max(99),
  startsAt: z.string().datetime()
});

const cancelCourtReservationSchema = z.object({
  reservationId: z.string().uuid(),
  clubId: z.string().uuid()
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

function clubJoinRequestEmailHtml({
  title,
  text,
  cta,
  url
}: {
  title: string;
  text: string;
  cta: string;
  url: string;
}) {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a;max-width:560px">
      <h1 style="font-size:24px;margin:0 0 16px">SquashFlow</h1>
      <p style="font-size:16px;margin:0 0 18px">${title}</p>
      <p style="font-size:15px;margin:0 0 22px">${text}</p>
      <p style="margin:0 0 24px">
        <a href="${url}" style="background:#0f766e;border-radius:6px;color:#fff;display:inline-block;font-weight:700;padding:12px 18px;text-decoration:none">${cta}</a>
      </p>
      <p style="color:#64748b;font-size:13px;margin:0">${url}</p>
    </div>
  `;
}

function weekStart(date = new Date()) {
  return courtWeekStart(date);
}

function isBookableCourtSlot(startsAt: Date) {
  const currentWeekStart = weekStart();
  const nextWeekEnd = courtLocalDateTimeToUtc(addDaysToCourtDateKey(courtDateKey(currentWeekStart), 14));
  const { hour, minute } = courtBookingHourMinute(startsAt);

  return startsAt >= new Date() &&
    startsAt >= currentWeekStart &&
    startsAt < nextWeekEnd &&
    minute === 0 &&
    hour >= 8 &&
    hour <= 20;
}

function parseClosedDays(value?: string) {
  return [...new Set((value ?? "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item)))];
}

function genericProfileVariant(gender: "male" | "female" | "other" | "not_specified") {
  if (gender === "male" || gender === "female") return gender;
  return "neutral";
}

function parseOptionalBirthDate(value: string | undefined) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

async function syncOpenPlayerNameSnapshots(playerId: string, displayName: string) {
  const rosters = await prisma.teamRoster.findMany({
    where: { playerId },
    select: { teamId: true }
  });

  await prisma.$transaction([
    prisma.$executeRaw`
      UPDATE team_rosters tr
      SET player_name_at_that_time = ${displayName},
          updated_at = now()
      FROM seasons s
      WHERE tr.season_id = s.id
        AND s.status <> 'closed'
        AND tr.player_id = ${playerId}::uuid
    `,
    prisma.$executeRaw`
      UPDATE matches m
      SET home_player_name_at_match_time = ${displayName},
          updated_at = now()
      FROM seasons s
      WHERE m.season_id = s.id
        AND s.status <> 'closed'
        AND m.home_player_id = ${playerId}::uuid
    `,
    prisma.$executeRaw`
      UPDATE matches m
      SET away_player_name_at_match_time = ${displayName},
          updated_at = now()
      FROM seasons s
      WHERE m.season_id = s.id
        AND s.status <> 'closed'
        AND m.away_player_id = ${playerId}::uuid
    `,
    prisma.$executeRaw`
      UPDATE tournament_registrations tr
      SET player_name_at_registration = ${displayName},
          updated_at = now()
      FROM competition_categories cc
      JOIN competitions c ON c.id = cc.competition_id
      JOIN seasons s ON s.id = c.season_id
      WHERE tr.competition_category_id = cc.id
        AND s.status <> 'closed'
        AND tr.player_id = ${playerId}::uuid
    `,
    prisma.$executeRaw`
      UPDATE tournament_seeds ts
      SET player_name_at_time = ${displayName}
      FROM competition_categories cc
      JOIN competitions c ON c.id = cc.competition_id
      JOIN seasons s ON s.id = c.season_id
      WHERE ts.competition_category_id = cc.id
        AND s.status <> 'closed'
        AND ts.player_id = ${playerId}::uuid
    `,
    prisma.$executeRaw`
      UPDATE tournament_draw_entries tde
      SET player_name_at_time = ${displayName}
      FROM competition_categories cc
      JOIN competitions c ON c.id = cc.competition_id
      JOIN seasons s ON s.id = c.season_id
      WHERE tde.competition_category_id = cc.id
        AND s.status <> 'closed'
        AND tde.player_id = ${playerId}::uuid
    `
  ]);

  return [...new Set(rosters.map((roster) => roster.teamId))];
}

function hasClubLocationChanged(
  currentClub: { address: string | null; city: string | null; province: string | null; postalCode: string | null; latitude: number | null; longitude: number | null } | null,
  nextClub: { address?: string | null; city?: string | null; province?: string | null; postalCode?: string | null }
) {
  if (!currentClub) return true;
  if (currentClub.latitude === null || currentClub.longitude === null) return true;

  return ["address", "city", "province", "postalCode"].some((field) => {
    const key = field as keyof typeof nextClub;
    const currentValue = currentClub[key]?.trim() ?? "";
    const nextValue = nextClub[key]?.trim() ?? "";
    return currentValue !== nextValue;
  });
}

async function readProfilePhoto(formData: FormData) {
  return readUploadedImage(formData, "profilePhoto", "La foto", 1_500_000, "1,5 MB");
}

async function readClubLogo(formData: FormData) {
  return readUploadedImage(formData, "clubLogo", "El escudo", 1_500_000, "1,5 MB");
}

async function readTournamentPoster(formData: FormData) {
  return readUploadedImage(formData, "poster", "El póster", 2_500_000, "2,5 MB");
}

async function readUploadedImage(formData: FormData, fieldName: string, label: string, maxSize: number, maxSizeLabel: string) {
  const file = formData.get(fieldName);
  if (!(file instanceof File) || file.size === 0) return undefined;

  if (!file.type.startsWith("image/")) {
    throw new Error(`${label} debe ser una imagen.`);
  }

  if (file.size > maxSize) {
    throw new Error(`${label} no puede superar ${maxSizeLabel}.`);
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
    where: { name: "Open", genderScope: "not_specified" }
  });

  if (existing) {
    return existing;
  }

  return prisma.category.create({
    data: {
      name: "Open",
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

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function leagueFrequencyDays(matchFrequency: "weekly" | "biweekly") {
  return matchFrequency === "weekly" ? 7 : 14;
}

function isoWeekday(date: Date) {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

function leagueRoundStart(startsAt: string, roundIndex: number, matchFrequency: "weekly" | "biweekly") {
  const date = new Date(startsAt);
  date.setDate(date.getDate() + roundIndex * leagueFrequencyDays(matchFrequency));
  date.setHours(0, 0, 0, 0);
  return date;
}

function leagueMatchDate(
  startsAt: string,
  roundIndex: number,
  matchIndex: number,
  matchFrequency: "weekly" | "biweekly",
  preferredMatchWeekday?: number | ""
) {
  const start = leagueRoundStart(startsAt, roundIndex, matchFrequency);
  const date = new Date(start);
  if (preferredMatchWeekday) {
    date.setDate(start.getDate() + ((preferredMatchWeekday - isoWeekday(start) + 7) % 7));
  } else {
    date.setDate(start.getDate() + (matchIndex % 7));
  }
  date.setHours(19, 0, 0, 0);
  return date;
}

function leagueMatchdayWindow(startsAt: string, roundIndex: number, matchFrequency: "weekly" | "biweekly") {
  const start = leagueRoundStart(startsAt, roundIndex, matchFrequency);
  const end = addDays(start, leagueFrequencyDays(matchFrequency) - 1);
  return { startsAt: start, endsAt: end };
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
    select: { seasonId: true, startsAt: true, hostClubId: true, hostClub: { select: { name: true } } }
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
      venueClubId: competition.hostClubId,
      homeClubNameAtMatchTime: competition.hostClub?.name ?? null,
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

function playerAgeAt(referenceDate: Date, birthDate: Date | null) {
  if (!birthDate) return null;

  let age = referenceDate.getFullYear() - birthDate.getFullYear();
  const birthdayThisYear = new Date(referenceDate);
  birthdayThisYear.setMonth(birthDate.getMonth(), birthDate.getDate());
  if (referenceDate < birthdayThisYear) age -= 1;
  return age;
}

async function assertPlayerEligibleForCompetitionCategory(competitionCategoryId: string, playerId: string) {
  const competitionCategory = await prisma.competitionCategory.findUniqueOrThrow({
    where: { id: competitionCategoryId },
    include: { competition: true, category: true }
  });
  const player = await prisma.player.findUniqueOrThrow({
    where: { id: playerId },
    select: { gender: true, birthDate: true, mergedIntoPlayerId: true }
  });
  if (player.mergedIntoPlayerId) {
    throw new Error("Esta ficha de jugador está fusionada con otra ficha principal.");
  }
  const referenceDate = competitionCategory.competition.startsAt ?? new Date();
  const age = playerAgeAt(referenceDate, player.birthDate);
  const genderMatches = competitionCategory.category.genderScope === "not_specified" || player.gender === competitionCategory.category.genderScope;

  if (!genderMatches) {
    throw new Error("El jugador no cumple la restricción de sexo de esta categoría.");
  }

  if (competitionCategory.category.minAge !== null && (age === null || age < competitionCategory.category.minAge)) {
    throw new Error(`El jugador debe tener al menos ${competitionCategory.category.minAge} años para inscribirse en esta categoría.`);
  }

  if (competitionCategory.category.maxAge !== null && (age === null || age > competitionCategory.category.maxAge)) {
    throw new Error(`El jugador debe tener como máximo ${competitionCategory.category.maxAge} años para inscribirse en esta categoría.`);
  }
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

  await assertPlayerEligibleForCompetitionCategory(competitionCategoryId, playerId);

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
  const communicationsEnabled = await isFeatureEnabled("player_communications");
  const parsed = playerSchema.parse({
    playerId: textValue(formData.get("playerId")),
    firstName: textValue(formData.get("firstName")),
    lastName: textValue(formData.get("lastName")),
    email: textValue(formData.get("email"))?.toLowerCase(),
    phone: textValue(formData.get("phone")),
    emailVerified: formData.get("emailVerified") === "on",
    preferredLocale: textValue(formData.get("preferredLocale")) ?? "es",
    gender: textValue(formData.get("gender")) ?? "not_specified",
    birthDate: textValue(formData.get("birthDate")) ?? "",
    dominantHand: textValue(formData.get("dominantHand")) ?? "not_specified",
    heightCm: textValue(formData.get("heightCm")) ?? "",
    weightKg: textValue(formData.get("weightKg")) ?? "",
    racketBrand: textValue(formData.get("racketBrand")),
    showContactPublic: formData.get("showContactPublic") === "on",
    showPhysicalPublic: formData.get("showPhysicalPublic") === "on",
    receivesMatchCommunications: communicationsEnabled && formData.get("receivesMatchCommunications") === "on",
    clubId: textValue(formData.get("clubId")) ?? "",
    profilePhotoUrl: uploadedProfilePhotoUrl ?? textValue(formData.get("profilePhotoUrl"))
  });

  if (!isAdmin) {
    if (!parsed.email) {
      throw new Error("La dirección de email es obligatoria para modificar tu perfil.");
    }

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
  const parsedEmail = parsed.email || null;
  const parsedBirthDate = parseOptionalBirthDate(parsed.birthDate);
  const user = isAdmin
    ? parsedEmail
      ? await prisma.user.upsert({
          where: { email: parsedEmail },
          update: {
            displayName,
            phone: parsed.phone,
            emailVerified: parsed.emailVerified,
            preferredLocale: parsed.preferredLocale
          },
          create: {
            firebaseUid: `local:${parsedEmail}`,
            email: parsedEmail,
            displayName,
            phone: parsed.phone,
            emailVerified: parsed.emailVerified,
            preferredLocale: parsed.preferredLocale
          }
        })
      : null
    : await prisma.user.update({
        where: { id: currentUser.id },
        data: {
          displayName,
          phone: parsed.phone,
          preferredLocale: parsed.preferredLocale
        }
      });

  if (user) {
    await ensureCredential(user.id);
    await prisma.userRoleAssignment.upsert({
      where: { userId_role: { userId: user.id, role: "player" } },
      update: {},
      create: { userId: user.id, role: "player" }
    });
  }

  const player = parsed.playerId
    ? await prisma.player.update({
        where: { id: parsed.playerId },
        data: {
          userId: user?.id ?? null,
          firstName: parsed.firstName,
          lastName: parsed.lastName,
          gender: parsed.gender,
          birthDate: parsedBirthDate,
          dominantHand: parsed.dominantHand,
          heightCm: parsed.heightCm || null,
          weightKg: parsed.weightKg || null,
          racketBrand: parsed.racketBrand,
          profilePhotoUrl: parsed.profilePhotoUrl || null,
          genericProfileVariant: genericProfileVariant(parsed.gender),
          showContactPublic: parsed.showContactPublic,
          showPhysicalPublic: parsed.showPhysicalPublic,
          ...(communicationsEnabled ? { receivesMatchCommunications: parsed.receivesMatchCommunications } : {})
        }
      })
    : await prisma.player.create({
        data: {
          userId: user?.id ?? null,
          firstName: parsed.firstName,
          lastName: parsed.lastName,
          gender: parsed.gender,
          birthDate: parsedBirthDate,
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

  const affectedTeamIds = await syncOpenPlayerNameSnapshots(player.id, displayName);

  revalidatePath("/admin/players");
  revalidatePath(`/players/${player.id}`);
  revalidatePath(`/players/${player.id}/edit`);
  affectedTeamIds.forEach((teamId) => revalidatePath(`/teams/${teamId}`));
  redirect(`/players/${player.id}/edit?saved=1`);
}

export async function changePlayerPasswordAction(formData: FormData) {
  const currentUser = await requireUser();
  const isAdmin = hasRole(currentUser, "admin");
  const parsed = playerPasswordSchema.parse({
    playerId: textValue(formData.get("playerId")),
    currentPassword: textValue(formData.get("currentPassword")),
    newPassword: textValue(formData.get("newPassword")),
    confirmPassword: textValue(formData.get("confirmPassword"))
  });
  const player = await prisma.player.findUnique({
    where: { id: parsed.playerId },
    include: { user: { include: { credential: true } } }
  });

  if (!player?.userId || !player.user) {
    throw new Error("Este jugador no tiene usuario asociado.");
  }

  if (!isAdmin && player.userId !== currentUser.id) {
    throw new Error("Solo puedes modificar tu propia contraseña.");
  }

  if (!isAdmin) {
    if (!player.user.credential) {
      throw new Error("No hay credenciales locales configuradas para este usuario.");
    }

    const currentPasswordOk = parsed.currentPassword
      ? await bcrypt.compare(parsed.currentPassword, player.user.credential.passwordHash)
      : false;

    if (!currentPasswordOk) {
      throw new Error("La contraseña actual no es correcta.");
    }
  }

  const passwordHash = await bcrypt.hash(parsed.newPassword, 12);
  await prisma.authCredential.upsert({
    where: { userId: player.userId },
    update: {
      passwordHash,
      passwordChangedAt: new Date()
    },
    create: {
      userId: player.userId,
      passwordHash
    }
  });

  revalidatePath(`/players/${player.id}`);
  revalidatePath(`/players/${player.id}/edit`);
}

export async function updateUserOperationalRoleAction(formData: FormData) {
  const currentUser = await requireUser();
  if (!hasRole(currentUser, "admin")) {
    throw new Error("Solo un admin puede modificar roles de usuario.");
  }

  const parsed = userOperationalRoleSchema.parse({
    userId: textValue(formData.get("userId")),
    role: textValue(formData.get("role"))
  });
  const user = await prisma.user.findUnique({
    where: { id: parsed.userId },
    include: { player: true }
  });

  if (!user) {
    throw new Error("Usuario no encontrado.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.userRoleAssignment.upsert({
      where: { userId_role: { userId: user.id, role: "player" } },
      update: {},
      create: { userId: user.id, role: "player" }
    });

    if (parsed.role === "manager") {
      await tx.userRoleAssignment.upsert({
        where: { userId_role: { userId: user.id, role: "manager" } },
        update: {},
        create: { userId: user.id, role: "manager" }
      });
    } else {
      await tx.userRoleAssignment.deleteMany({
        where: { userId: user.id, role: "manager" }
      });
    }
  });

  revalidatePath("/admin/players");
  if (user.player) {
    revalidatePath(`/players/${user.player.id}`);
    revalidatePath(`/players/${user.player.id}/edit`);
  }
}

export async function updateUserSuspensionAction(formData: FormData) {
  const currentUser = await requireUser();
  if (!hasRole(currentUser, "admin")) {
    throw new Error("Solo un admin puede suspender o reactivar usuarios.");
  }

  const parsed = userSuspensionSchema.parse({
    userId: textValue(formData.get("userId")),
    action: textValue(formData.get("action")),
    reason: textValue(formData.get("reason"))
  });

  if (parsed.userId === currentUser.id) {
    throw new Error("No puedes suspender tu propia cuenta.");
  }

  const user = await prisma.user.findUnique({
    where: { id: parsed.userId },
    include: { player: true }
  });

  if (!user) {
    throw new Error("Usuario no encontrado.");
  }

  if (parsed.action === "suspend") {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          suspendedAt: new Date(),
          suspendedByUserId: currentUser.id,
          suspensionReason: parsed.reason ?? null
        }
      }),
      prisma.authSession.deleteMany({ where: { userId: user.id } })
    ]);
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        suspendedAt: null,
        suspendedByUserId: null,
        suspensionReason: null
      }
    });
  }

  revalidatePath("/admin/players");
  if (user.player) {
    revalidatePath(`/players/${user.player.id}`);
    revalidatePath(`/players/${user.player.id}/edit`);
  }
}

export async function reviewPlayerLinkRequestAction(formData: FormData) {
  const currentUser = await requireUser();
  if (!hasRole(currentUser, "admin")) {
    throw new Error("Solo un admin puede revisar solicitudes de vinculación.");
  }

  const parsed = playerLinkRequestSchema.parse({
    requestId: textValue(formData.get("requestId")),
    action: textValue(formData.get("action"))
  });

  const request = await prisma.playerLinkRequest.findUnique({
    where: { id: parsed.requestId },
    include: {
      user: { include: { player: true } },
      candidatePlayer: true
    }
  });

  if (!request || request.status !== "pending") {
    throw new Error("Solicitud no encontrada o ya revisada.");
  }

  if (parsed.action === "reject") {
    await prisma.playerLinkRequest.update({
      where: { id: request.id },
      data: {
        status: "rejected",
        reviewedByUserId: currentUser.id,
        reviewedAt: new Date()
      }
    });
  } else {
    if (request.user.player) {
      throw new Error("El usuario ya tiene una ficha de jugador vinculada.");
    }

    if (request.candidatePlayer.userId) {
      throw new Error("La ficha candidata ya tiene una cuenta vinculada.");
    }

    if (request.candidatePlayer.mergedIntoPlayerId) {
      throw new Error("La ficha candidata ya está fusionada con otra ficha principal.");
    }

    await prisma.$transaction([
      prisma.player.update({
        where: { id: request.candidatePlayerId },
        data: { userId: request.userId }
      }),
      prisma.user.update({
        where: { id: request.userId },
        data: {
          displayName: `${request.candidatePlayer.firstName} ${request.candidatePlayer.lastName}`
        }
      }),
      prisma.playerLinkRequest.update({
        where: { id: request.id },
        data: {
          status: "approved",
          reviewedByUserId: currentUser.id,
          reviewedAt: new Date()
        }
      })
    ]);
  }

  revalidatePath("/admin/players");
  revalidatePath("/admin/players/duplicates");
  revalidatePath(`/players/${request.candidatePlayerId}`);
  revalidatePath(`/players/${request.candidatePlayerId}/edit`);
}

export async function mergePlayerProfilesAction(formData: FormData) {
  const currentUser = await requireUser();
  if (!hasRole(currentUser, "admin")) {
    throw new Error("Solo un admin puede fusionar fichas de jugador.");
  }

  const parsed = playerMergeSchema.parse({
    primaryPlayerId: textValue(formData.get("primaryPlayerId")),
    duplicatePlayerId: textValue(formData.get("duplicatePlayerId"))
  });

  if (parsed.primaryPlayerId === parsed.duplicatePlayerId) {
    throw new Error("Selecciona dos fichas distintas.");
  }

  await prisma.$transaction(async (tx) => {
    const [primary, duplicate] = await Promise.all([
      tx.player.findUnique({ where: { id: parsed.primaryPlayerId }, include: { user: true } }),
      tx.player.findUnique({ where: { id: parsed.duplicatePlayerId }, include: { user: true } })
    ]);

    if (!primary || !duplicate) {
      throw new Error("No se han encontrado las fichas seleccionadas.");
    }

    if (duplicate.mergedIntoPlayerId) {
      throw new Error("La ficha duplicada ya está fusionada.");
    }

    if (primary.mergedIntoPlayerId) {
      throw new Error("La ficha principal ya está fusionada en otra ficha.");
    }

    if (primary.userId && duplicate.userId && primary.userId !== duplicate.userId) {
      throw new Error("No se pueden fusionar dos fichas con cuentas de usuario distintas.");
    }

    const displayName = `${primary.firstName} ${primary.lastName}`;
    const beforeData = JSON.parse(JSON.stringify({ primary, duplicate }));

    if (!primary.userId && duplicate.userId) {
      await tx.player.update({
        where: { id: duplicate.id },
        data: { userId: null }
      });
      await tx.player.update({
        where: { id: primary.id },
        data: { userId: duplicate.userId }
      });
    }

    await tx.$executeRaw`
      DELETE FROM player_club_memberships duplicate_membership
      WHERE duplicate_membership.player_id = ${duplicate.id}
        AND EXISTS (
          SELECT 1 FROM player_club_memberships primary_membership
          WHERE primary_membership.player_id = ${primary.id}
            AND primary_membership.club_id = duplicate_membership.club_id
            AND primary_membership.season_id = duplicate_membership.season_id
        )
    `;
    await tx.$executeRaw`UPDATE player_club_memberships SET player_id = ${primary.id} WHERE player_id = ${duplicate.id}`;

    await tx.$executeRaw`
      DELETE FROM team_rosters duplicate_roster
      WHERE duplicate_roster.player_id = ${duplicate.id}
        AND EXISTS (
          SELECT 1 FROM team_rosters primary_roster
          WHERE primary_roster.player_id = ${primary.id}
            AND primary_roster.team_id = duplicate_roster.team_id
            AND primary_roster.season_id = duplicate_roster.season_id
            AND primary_roster.category_id = duplicate_roster.category_id
        )
    `;
    await tx.$executeRaw`
      UPDATE team_rosters
      SET player_id = ${primary.id}, player_name_at_that_time = ${displayName}
      WHERE player_id = ${duplicate.id}
    `;

    await tx.$executeRaw`
      DELETE FROM tournament_registrations duplicate_registration
      WHERE duplicate_registration.player_id = ${duplicate.id}
        AND EXISTS (
          SELECT 1 FROM tournament_registrations primary_registration
          WHERE primary_registration.player_id = ${primary.id}
            AND primary_registration.competition_category_id = duplicate_registration.competition_category_id
        )
    `;
    await tx.$executeRaw`
      UPDATE tournament_registrations
      SET player_id = ${primary.id}, player_name_at_registration = ${displayName}
      WHERE player_id = ${duplicate.id}
    `;

    await tx.$executeRaw`
      DELETE FROM competition_participants duplicate_participant
      WHERE duplicate_participant.player_id = ${duplicate.id}
        AND EXISTS (
          SELECT 1 FROM competition_participants primary_participant
          WHERE primary_participant.player_id = ${primary.id}
            AND primary_participant.competition_category_id = duplicate_participant.competition_category_id
        )
    `;
    await tx.$executeRaw`UPDATE competition_participants SET player_id = ${primary.id} WHERE player_id = ${duplicate.id}`;

    await tx.$executeRaw`
      DELETE FROM club_join_requests duplicate_request
      WHERE duplicate_request.player_id = ${duplicate.id}
        AND EXISTS (
          SELECT 1 FROM club_join_requests primary_request
          WHERE primary_request.player_id = ${primary.id}
            AND primary_request.club_id = duplicate_request.club_id
            AND primary_request.season_id IS NOT DISTINCT FROM duplicate_request.season_id
        )
    `;
    await tx.$executeRaw`UPDATE club_join_requests SET player_id = ${primary.id} WHERE player_id = ${duplicate.id}`;

    await tx.$executeRaw`
      DELETE FROM tournament_seeds duplicate_seed
      WHERE duplicate_seed.player_id = ${duplicate.id}
        AND EXISTS (
          SELECT 1 FROM tournament_seeds primary_seed
          WHERE primary_seed.player_id = ${primary.id}
            AND primary_seed.competition_category_id = duplicate_seed.competition_category_id
        )
    `;
    await tx.$executeRaw`
      UPDATE tournament_seeds
      SET player_id = ${primary.id}, player_name_at_time = ${displayName}
      WHERE player_id = ${duplicate.id}
    `;

    await tx.$executeRaw`
      UPDATE tournament_draw_entries
      SET player_id = ${primary.id}, player_name_at_time = ${displayName}
      WHERE player_id = ${duplicate.id}
    `;

    await tx.$executeRaw`
      DELETE FROM individual_ranking_snapshots duplicate_snapshot
      WHERE duplicate_snapshot.player_id = ${duplicate.id}
        AND EXISTS (
          SELECT 1 FROM individual_ranking_snapshots primary_snapshot
          WHERE primary_snapshot.player_id = ${primary.id}
            AND primary_snapshot.season_id = duplicate_snapshot.season_id
            AND primary_snapshot.competition_id = duplicate_snapshot.competition_id
            AND primary_snapshot.competition_category_id = duplicate_snapshot.competition_category_id
        )
    `;
    await tx.$executeRaw`
      UPDATE individual_ranking_snapshots
      SET player_id = ${primary.id}, player_name_at_that_time = ${displayName}
      WHERE player_id = ${duplicate.id}
    `;

    await tx.$executeRaw`
      UPDATE court_reservations
      SET player_id = ${primary.id}
      WHERE player_id = ${duplicate.id}
    `;
    await tx.$executeRaw`
      UPDATE court_reservations
      SET partner_player_id = ${primary.id}
      WHERE partner_player_id = ${duplicate.id}
    `;

    await tx.$executeRaw`
      UPDATE matches
      SET
        home_player_name_at_match_time = CASE WHEN home_player_id = ${duplicate.id} THEN ${displayName} ELSE home_player_name_at_match_time END,
        away_player_name_at_match_time = CASE WHEN away_player_id = ${duplicate.id} THEN ${displayName} ELSE away_player_name_at_match_time END,
        home_player_id = CASE WHEN home_player_id = ${duplicate.id} THEN ${primary.id} ELSE home_player_id END,
        away_player_id = CASE WHEN away_player_id = ${duplicate.id} THEN ${primary.id} ELSE away_player_id END,
        winner_player_id = CASE WHEN winner_player_id = ${duplicate.id} THEN ${primary.id} ELSE winner_player_id END,
        walkover_by_player_id = CASE WHEN walkover_by_player_id = ${duplicate.id} THEN ${primary.id} ELSE walkover_by_player_id END,
        retired_by_player_id = CASE WHEN retired_by_player_id = ${duplicate.id} THEN ${primary.id} ELSE retired_by_player_id END
      WHERE home_player_id = ${duplicate.id}
        OR away_player_id = ${duplicate.id}
        OR winner_player_id = ${duplicate.id}
        OR walkover_by_player_id = ${duplicate.id}
        OR retired_by_player_id = ${duplicate.id}
    `;

    await tx.playerLinkRequest.updateMany({
      where: { candidatePlayerId: duplicate.id, status: "pending" },
      data: {
        status: "rejected",
        reviewedByUserId: currentUser.id,
        reviewedAt: new Date()
      }
    });
    if (duplicate.userId) {
      await tx.playerLinkRequest.updateMany({
        where: { userId: duplicate.userId, status: "pending" },
        data: {
          candidatePlayerId: primary.id,
          updatedAt: new Date()
        }
      });
    }

    await tx.player.update({
      where: { id: duplicate.id },
      data: {
        userId: null,
        mergedIntoPlayerId: primary.id,
        mergedAt: new Date()
      }
    });

    await tx.playerMergeLog.create({
      data: {
        primaryPlayerId: primary.id,
        duplicatePlayerId: duplicate.id,
        mergedByUserId: currentUser.id,
        beforeData
      }
    });
  });

  revalidatePath("/admin/players");
  revalidatePath("/admin/players/duplicates");
  revalidatePath(`/players/${parsed.primaryPlayerId}`);
  revalidatePath(`/players/${parsed.duplicatePlayerId}`);
  redirect(`/players/${parsed.primaryPlayerId}`);
}

export async function requestJoinClubAction(formData: FormData) {
  const currentUser = await requireUser();
  const { t } = await getDictionary();
  const parsed = clubJoinRequestSchema.parse({
    playerId: textValue(formData.get("playerId")),
    clubId: textValue(formData.get("clubId"))
  });

  const [player, club, season] = await Promise.all([
    prisma.player.findUnique({
      where: { id: parsed.playerId },
      include: { user: true }
    }),
    prisma.club.findUnique({
      where: { id: parsed.clubId },
      include: { manager: true }
    }),
    getDefaultSeason()
  ]);

  if (!player || player.userId !== currentUser.id) {
    throw new Error("Solo puedes solicitar club desde tu propia ficha.");
  }

  if (player.mergedIntoPlayerId) {
    throw new Error("Esta ficha está fusionada con otra ficha principal.");
  }

  if (!club) {
    throw new Error("Club no encontrado.");
  }

  const currentMembership = await prisma.playerClubMembership.findFirst({
    where: {
      playerId: player.id,
      seasonId: season.id
    },
    include: { club: true }
  });

  if (currentMembership) {
    throw new Error("Ya perteneces a un club en esta temporada.");
  }

  await prisma.clubJoinRequest.upsert({
    where: {
      playerId_clubId_seasonId: {
        playerId: player.id,
        clubId: club.id,
        seasonId: season.id
      }
    },
    update: {
      status: "pending",
      requestedAt: new Date(),
      resolvedAt: null,
      resolvedByUserId: null,
      notes: null
    },
    create: {
      playerId: player.id,
      clubId: club.id,
      seasonId: season.id,
      status: "pending"
    }
  });

  const url = `${appBaseUrl()}/clubs/${club.id}`;
  const playerName = `${player.firstName} ${player.lastName}`;
  const notificationRecipients = club.manager?.email
    ? [club.manager.email]
    : (await prisma.user.findMany({
        where: { roles: { some: { role: "admin" } } },
        select: { email: true }
      })).map((admin) => admin.email);

  if (notificationRecipients.length) {
    try {
      await Promise.all(
        notificationRecipients.map((recipient) => sendTransactionalEmail({
          to: recipient,
          subject: t.clubJoinRequestEmailSubject,
          text: `${playerName} ${t.clubJoinRequestEmailText} ${club.name}\n\n${url}`,
          html: clubJoinRequestEmailHtml({
            title: t.clubJoinRequestEmailTitle,
            text: `${playerName} ${t.clubJoinRequestEmailText} ${club.name}.`,
            cta: t.reviewClubJoinRequests,
            url
          })
        })
      ));
    } catch (error) {
      console.error("Club join request email failed", error);
      revalidatePath(`/players/${player.id}/edit`);
      redirect(`/players/${player.id}/edit?joinEmailFailed=1`);
    }
  } else {
    revalidatePath(`/players/${player.id}/edit`);
    revalidatePath(`/clubs/${club.id}`);
    redirect(`/players/${player.id}/edit?joinEmailFailed=1`);
  }

  revalidatePath(`/players/${player.id}/edit`);
  revalidatePath(`/clubs/${club.id}`);
  redirect(`/players/${player.id}/edit?joinRequested=1`);
}

export async function reviewClubJoinRequestAction(formData: FormData) {
  const currentUser = await requireUser();
  const isAdmin = hasRole(currentUser, "admin");
  const parsed = clubJoinReviewSchema.parse({
    requestId: textValue(formData.get("requestId")),
    action: textValue(formData.get("action"))
  });

  const request = await prisma.clubJoinRequest.findUnique({
    where: { id: parsed.requestId },
    include: {
      player: true,
      club: true,
      season: true
    }
  });

  if (!request || request.status !== "pending") {
    throw new Error("Solicitud no encontrada o ya revisada.");
  }

  if (!isAdmin && request.club.managerUserId !== currentUser.id) {
    throw new Error("Solo el responsable del club puede revisar esta solicitud.");
  }

  if (parsed.action === "reject") {
    await prisma.clubJoinRequest.update({
      where: { id: request.id },
      data: {
        status: "rejected",
        resolvedAt: new Date(),
        resolvedByUserId: currentUser.id
      }
    });
  } else {
    if (!request.seasonId) {
      throw new Error("La solicitud no tiene temporada asociada.");
    }
    if (!request.season) {
      throw new Error("No se ha encontrado la temporada de la solicitud.");
    }

    const existingMembership = await prisma.playerClubMembership.findFirst({
      where: {
        playerId: request.playerId,
        seasonId: request.seasonId
      }
    });

    if (existingMembership) {
      throw new Error("Este jugador ya pertenece a un club en esta temporada.");
    }

    await prisma.$transaction([
      prisma.playerClubMembership.create({
        data: {
          playerId: request.playerId,
          clubId: request.clubId,
          seasonId: request.seasonId,
          clubNameAtThatTime: request.club.name,
          fromDate: request.season.startsAt
        }
      }),
      prisma.clubJoinRequest.update({
        where: { id: request.id },
        data: {
          status: "approved",
          resolvedAt: new Date(),
          resolvedByUserId: currentUser.id
        }
      }),
      prisma.clubJoinRequest.updateMany({
        where: {
          playerId: request.playerId,
          seasonId: request.seasonId,
          status: "pending",
          id: { not: request.id }
        },
        data: {
          status: "rejected",
          resolvedAt: new Date(),
          resolvedByUserId: currentUser.id,
          notes: "Rejected automatically because another club request was accepted for the season."
        }
      })
    ]);
  }

  revalidatePath(`/clubs/${request.clubId}`);
  revalidatePath(`/clubs/${request.clubId}/edit`);
  revalidatePath(`/players/${request.playerId}`);
  revalidatePath(`/players/${request.playerId}/edit`);
  redirect(`/clubs/${request.clubId}?joinReviewed=1`);
}

export async function saveClubAction(formData: FormData) {
  const currentUser = await requireUser();
  const isAdmin = hasRole(currentUser, "admin");
  const logoUrl = await readClubLogo(formData);
  const parsedResult = clubSchema.safeParse({
    clubId: textValue(formData.get("clubId")),
    name: textValue(formData.get("name")),
    city: textValue(formData.get("city")),
    province: textValue(formData.get("province")),
    address: textValue(formData.get("address")),
    postalCode: textValue(formData.get("postalCode")),
    availableCourts: textValue(formData.get("availableCourts")) ?? "0",
    phone: textValue(formData.get("phone")),
    managesCourtBookings: formData.get("managesCourtBookings") === "on",
    closedDays: formData.get("closedDays")?.toString(),
    websiteUrl: textValue(formData.get("websiteUrl")) ?? "",
    showContactPublic: formData.get("showContactPublic") === "on",
    managerUserId: textValue(formData.get("managerUserId")) ?? ""
  });
  if (!parsedResult.success) {
    redirect("/admin/clubs?clubError=invalid");
  }
  const parsed = parsedResult.data;
  const existingClub = parsed.clubId
    ? await prisma.club.findUniqueOrThrow({
        where: { id: parsed.clubId },
        select: {
          managerUserId: true,
          address: true,
          city: true,
          province: true,
          postalCode: true,
          latitude: true,
          longitude: true
        }
      })
    : null;
  const shouldGeocode = hasClubLocationChanged(existingClub, parsed);
  const geocoding = shouldGeocode ? await geocodeClubAddress(parsed) : null;
  const geocodingData = shouldGeocode
    ? geocoding
      ? {
          latitude: geocoding.latitude,
          longitude: geocoding.longitude,
          geocodedAt: geocoding.geocodedAt,
          geocodingQuery: geocoding.geocodingQuery
        }
      : !existingClub || !clubGeocodingQuery(parsed)
      ? {
          latitude: null,
          longitude: null,
          geocodedAt: null,
          geocodingQuery: clubGeocodingQuery(parsed) || null
        }
      : {}
    : {};

  if (!isAdmin) {
    if (!parsed.clubId) {
      throw new Error("Solo un admin puede crear clubes.");
    }

    if (existingClub?.managerUserId !== currentUser.id) {
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
          postalCode: parsed.postalCode,
          ...geocodingData,
          availableCourts: parsed.availableCourts,
          phone: parsed.phone,
          managesCourtBookings: parsed.managesCourtBookings,
          websiteUrl: parsed.websiteUrl || null,
          logoUrl,
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
          postalCode: parsed.postalCode,
          ...geocodingData,
          availableCourts: parsed.availableCourts,
          phone: parsed.phone,
          managesCourtBookings: parsed.managesCourtBookings,
          websiteUrl: parsed.websiteUrl || null,
          logoUrl: logoUrl ?? null,
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

  const closedDays = parseClosedDays(parsed.closedDays);
  await prisma.$transaction([
    prisma.courtClosedDay.deleteMany({ where: { clubId: club.id } }),
    ...closedDays.map((closedOn) =>
      prisma.courtClosedDay.create({
        data: {
          clubId: club.id,
          closedOn: new Date(`${closedOn}T00:00:00.000Z`),
          createdByUserId: currentUser.id,
          updatedByUserId: currentUser.id
        }
      })
    )
  ]);

  const season = await getDefaultSeason();
  const [membershipPlayerIds, rosterPlayerIds] = await Promise.all([
    prisma.playerClubMembership.findMany({
      where: { clubId: club.id, seasonId: season.id },
      select: { playerId: true }
    }),
    prisma.teamRoster.findMany({
      where: {
        seasonId: season.id,
        team: { clubId: club.id }
      },
      select: { playerId: true }
    })
  ]);

  await prisma.$executeRaw`
    INSERT INTO club_season_profiles (club_id, season_id, display_name)
    VALUES (${club.id}::uuid, ${season.id}::uuid, ${club.name})
    ON CONFLICT (club_id, season_id)
    DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = now()
  `;
  await prisma.$transaction([
    prisma.playerClubMembership.updateMany({
      where: { clubId: club.id, seasonId: season.id },
      data: { clubNameAtThatTime: club.name }
    }),
    prisma.team.updateMany({
      where: { clubId: club.id, seasonId: season.id },
      data: { clubNameAtCreation: club.name }
    }),
    prisma.teamRoster.updateMany({
      where: {
        seasonId: season.id,
        team: { clubId: club.id }
      },
      data: { clubNameAtThatTime: club.name }
    })
  ]);
  await prisma.$transaction([
    prisma.$executeRaw`
      UPDATE team_ties tt
      SET home_team_name_at_time = t.name,
          home_club_name_at_time = ${club.name},
          updated_at = now()
      FROM teams t
      WHERE tt.home_team_id = t.id
        AND t.club_id = ${club.id}::uuid
        AND tt.season_id = ${season.id}::uuid
    `,
    prisma.$executeRaw`
      UPDATE team_ties tt
      SET away_team_name_at_time = t.name,
          away_club_name_at_time = ${club.name},
          updated_at = now()
      FROM teams t
      WHERE tt.away_team_id = t.id
        AND t.club_id = ${club.id}::uuid
        AND tt.season_id = ${season.id}::uuid
    `,
    prisma.$executeRaw`
      UPDATE matches m
      SET home_club_name_at_match_time = ${club.name},
          updated_at = now()
      WHERE m.home_club_id_at_match_time = ${club.id}::uuid
        AND m.season_id = ${season.id}::uuid
    `,
    prisma.$executeRaw`
      UPDATE matches m
      SET away_club_name_at_match_time = ${club.name},
          updated_at = now()
      WHERE m.away_club_id_at_match_time = ${club.id}::uuid
        AND m.season_id = ${season.id}::uuid
    `,
    prisma.$executeRaw`
      UPDATE matches m
      SET home_team_name_at_match_time = t.name,
          home_club_name_at_match_time = ${club.name},
          updated_at = now()
      FROM teams t
      WHERE m.home_team_id_at_match_time = t.id
        AND t.club_id = ${club.id}::uuid
        AND m.season_id = ${season.id}::uuid
    `,
    prisma.$executeRaw`
      UPDATE matches m
      SET away_team_name_at_match_time = t.name,
          away_club_name_at_match_time = ${club.name},
          updated_at = now()
      FROM teams t
      WHERE m.away_team_id_at_match_time = t.id
        AND t.club_id = ${club.id}::uuid
        AND m.season_id = ${season.id}::uuid
    `
  ]);

  revalidatePath("/admin/clubs");
  revalidatePath(`/clubs/${club.id}`);
  revalidatePath(`/clubs/${club.id}/edit`);
  revalidatePath("/manager/tournaments");
  new Set([...membershipPlayerIds, ...rosterPlayerIds].map((row) => row.playerId)).forEach((playerId) => {
    revalidatePath(`/players/${playerId}`);
  });
}

async function upsertCompetitionCategoryByDisplayName({
  competitionId,
  categoryId,
  displayName,
  format
}: {
  competitionId: string;
  categoryId: string;
  displayName: string;
  format: "league" | "knockout" | "round_robin";
}) {
  const existing = await prisma.competitionCategory.findFirst({
    where: { competitionId, displayName }
  });

  if (existing) {
    return prisma.competitionCategory.update({
      where: { id: existing.id },
      data: { categoryId, format }
    });
  }

  return prisma.competitionCategory.create({
    data: {
      competitionId,
      categoryId,
      displayName,
      format
    }
  });
}

export async function saveLeagueAction(formData: FormData) {
  if (!(await isFeatureEnabled("leagues"))) {
    throw new Error("La gestión de ligas no está activa.");
  }
  await requireAdmin();
  const shouldRegenerateSchedule = formData.get("mode")?.toString() === "regenerate" || !textValue(formData.get("competitionId"));
  const parsed = competitionSchema.parse({
    competitionId: textValue(formData.get("competitionId")),
    name: textValue(formData.get("name")),
    description: textValue(formData.get("description")),
    type: textValue(formData.get("type")) ?? "individual_league",
    bestOfSets: textValue(formData.get("bestOfSets")) ?? "5",
    registrationDeadline: textValue(formData.get("registrationDeadline")),
    startsAt: textValue(formData.get("startsAt")),
    matchFrequency: textValue(formData.get("matchFrequency")) ?? "biweekly",
    preferredMatchWeekday: textValue(formData.get("preferredMatchWeekday")) ?? "",
    hostClubId: textValue(formData.get("hostClubId")) ?? "",
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
          hostClubId: parsed.hostClubId || null,
          registrationDeadline: new Date(parsed.registrationDeadline),
          startsAt: new Date(parsed.startsAt),
          matchFrequency: parsed.matchFrequency,
          preferredMatchWeekday: parsed.preferredMatchWeekday || null
        }
      })
    : await prisma.competition.create({
        data: {
          seasonId: season.id,
          name: parsed.name,
          description: parsed.description,
          type: parsed.type,
          bestOfSets: parsed.bestOfSets,
          hostClubId: parsed.hostClubId || null,
          status: "draft",
          registrationDeadline: new Date(parsed.registrationDeadline),
          startsAt: new Date(parsed.startsAt),
          endsAt: null,
          matchFrequency: parsed.matchFrequency,
          preferredMatchWeekday: parsed.preferredMatchWeekday || null
        }
      });

  if (!shouldRegenerateSchedule) {
    revalidatePath("/admin/leagues");
    revalidatePath(`/leagues/${competition.id}`);
    revalidatePath(`/leagues/${competition.id}/edit`);
    redirect(`/leagues/${competition.id}/edit?saved=1`);
  }

  const competitionCategory = await upsertCompetitionCategoryByDisplayName({
    competitionId: competition.id,
    categoryId: category.id,
    displayName: category.name,
    format: "league"
  });

  await prisma.competitionParticipant.deleteMany({
    where: { competitionCategoryId: competitionCategory.id }
  });
  await prisma.match.deleteMany({ where: { competitionId: competition.id } });
  await prisma.teamTie.deleteMany({ where: { competitionId: competition.id } });
  await prisma.leagueMatchday.deleteMany({ where: { competitionId: competition.id } });
  if (parsed.participantIds.length < 2) {
    await prisma.competition.update({
      where: { id: competition.id },
      data: { endsAt: null }
    });
    revalidatePath("/admin/leagues");
    revalidatePath(`/leagues/${competition.id}`);
    revalidatePath(`/leagues/${competition.id}/edit`);
    return;
  }

  if (parsed.type === "individual_league") {
    const players = await prisma.player.findMany({
      where: {
        id: { in: parsed.participantIds },
        ...(parsed.hostClubId
          ? { memberships: { some: { clubId: parsed.hostClubId, toDate: null } } }
          : {})
      },
      include: { memberships: { include: { club: true }, take: 1 } }
    });
    if (players.length < 2) {
      await prisma.competition.update({
        where: { id: competition.id },
        data: { endsAt: null }
      });
      revalidatePath("/admin/leagues");
      revalidatePath(`/leagues/${competition.id}`);
      revalidatePath(`/leagues/${competition.id}/edit`);
      return;
    }

    await prisma.competitionParticipant.createMany({
      data: players.map((player) => ({
        competitionId: competition.id,
        competitionCategoryId: competitionCategory.id,
        playerId: player.id
      }))
    });

    const rounds = generateRoundRobin(shuffle(players));
    const matchdays = await Promise.all(
      rounds.map((_, roundIndex) => {
        const window = leagueMatchdayWindow(parsed.startsAt, roundIndex, parsed.matchFrequency);
        return prisma.leagueMatchday.create({
          data: {
            seasonId: season.id,
            competitionId: competition.id,
            competitionCategoryId: competitionCategory.id,
            roundNumber: roundIndex + 1,
            startsAt: window.startsAt,
            endsAt: window.endsAt
          }
        });
      })
    );
    await prisma.match.createMany({
      data: rounds.flatMap((round, roundIndex) =>
        round.map(([home, away], matchIndex) => ({
          seasonId: season.id,
          competitionId: competition.id,
          competitionCategoryId: competitionCategory.id,
          leagueMatchdayId: matchdays[roundIndex].id,
          matchType: "individual_league",
          roundNumber: roundIndex + 1,
          matchOrder: matchIndex + 1,
          scheduledAt: leagueMatchDate(parsed.startsAt, roundIndex, matchIndex, parsed.matchFrequency, parsed.preferredMatchWeekday),
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
    const clubs = await prisma.club.findMany({
      where: {
        id: { in: parsed.participantIds },
        ...(parsed.hostClubId ? { id: parsed.hostClubId } : {})
      }
    });
    if (clubs.length < 2) {
      await prisma.competition.update({
        where: { id: competition.id },
        data: { endsAt: null }
      });
      revalidatePath("/admin/leagues");
      revalidatePath(`/leagues/${competition.id}`);
      revalidatePath(`/leagues/${competition.id}/edit`);
      return;
    }
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
              name: `${club.name} Open`
            }
          },
          update: { clubNameAtCreation: club.name },
          create: {
            clubId: club.id,
            seasonId: season.id,
            categoryId: category.id,
            name: `${club.name} Open`,
            clubNameAtCreation: club.name
          }
        })
      )
    );

    const rounds = generateRoundRobin(shuffle(teams));
    const matchdays = await Promise.all(
      rounds.map((_, roundIndex) => {
        const window = leagueMatchdayWindow(parsed.startsAt, roundIndex, parsed.matchFrequency);
        return prisma.leagueMatchday.create({
          data: {
            seasonId: season.id,
            competitionId: competition.id,
            competitionCategoryId: competitionCategory.id,
            roundNumber: roundIndex + 1,
            startsAt: window.startsAt,
            endsAt: window.endsAt
          }
        });
      })
    );
    await prisma.teamTie.createMany({
      data: rounds.flatMap((round, roundIndex) =>
        round.map(([home, away], matchIndex) => ({
          seasonId: season.id,
          competitionId: competition.id,
          competitionCategoryId: competitionCategory.id,
          leagueMatchdayId: matchdays[roundIndex].id,
          scheduledAt: leagueMatchDate(parsed.startsAt, roundIndex, matchIndex, parsed.matchFrequency, parsed.preferredMatchWeekday),
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

  const latestMatchday = await prisma.leagueMatchday.findFirst({
    where: { competitionId: competition.id },
    orderBy: { endsAt: "desc" }
  });

  await prisma.competition.update({
    where: { id: competition.id },
    data: { endsAt: latestMatchday?.endsAt ?? null }
  });

  revalidatePath("/admin/leagues");
  revalidatePath(`/leagues/${competition.id}`);
  revalidatePath(`/leagues/${competition.id}/edit`);
}

export async function saveTournamentAction(formData: FormData) {
  if (!(await isFeatureEnabled("tournaments"))) {
    throw new Error("La gestión de torneos no está activa.");
  }
  const currentUser = await requireUser();
  const isAdmin = hasRole(currentUser, "admin");
  const shouldGenerateDraw = formData.get("mode")?.toString() === "generate";
  const uploadedPosterUrl = await readTournamentPoster(formData);
  const parsed = tournamentSchema.parse({
    competitionId: textValue(formData.get("competitionId")),
    name: textValue(formData.get("name")),
    description: textValue(formData.get("description")),
    posterUrl: uploadedPosterUrl ?? textValue(formData.get("posterUrl")),
    hostClubId: textValue(formData.get("hostClubId")),
    refereeName: textValue(formData.get("refereeName")),
    rankingCode: textValue(formData.get("rankingCode")) ?? "none",
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
  const rankingScope = rankingScopeForCode(parsed.rankingCode);
  const competition = parsed.competitionId
    ? await prisma.competition.update({
        where: { id: parsed.competitionId },
        data: {
          name: parsed.name,
          description: parsed.description,
          posterUrl: parsed.posterUrl || null,
          hostClubId: parsed.hostClubId,
          refereeName: parsed.refereeName,
          rankingScope,
          rankingCode: parsed.rankingCode,
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
          posterUrl: parsed.posterUrl || null,
          hostClubId: parsed.hostClubId,
          refereeName: parsed.refereeName,
          rankingScope,
          rankingCode: parsed.rankingCode,
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

  const categoriesById = new Map((await prisma.category.findMany({
    where: { id: { in: categoryIds } }
  })).map((category) => [category.id, category]));

  await Promise.all(
    categoryIds.map((categoryId) => {
      const category = categoriesById.get(categoryId);
      return upsertCompetitionCategoryByDisplayName({
        competitionId: competition.id,
        categoryId,
        displayName: category?.name ?? "Open",
        format: "knockout"
      });
    })
  );

  const competitionCategories = await prisma.competitionCategory.findMany({
    where: { competitionId: competition.id },
    orderBy: { createdAt: "asc" }
  });
  const hostClub = await prisma.club.findUnique({
    where: { id: parsed.hostClubId },
    select: { id: true, name: true }
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
            venueClubId: hostClub?.id ?? null,
            homePlayerId: home.id,
            awayPlayerId: away.id,
            homePlayerNameAtMatchTime: `${home.firstName} ${home.lastName}`,
            awayPlayerNameAtMatchTime: `${away.firstName} ${away.lastName}`,
            homeClubNameAtMatchTime: hostClub?.name ?? null
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
            venueClubId: hostClub?.id ?? null,
            homePlayerId: home?.id ?? null,
            awayPlayerId: away?.id ?? null,
            winnerPlayerId: home && !away ? home.id : !home && away ? away.id : null,
            homePlayerNameAtMatchTime: home ? `${home.firstName} ${home.lastName}` : null,
            awayPlayerNameAtMatchTime: away ? `${away.firstName} ${away.lastName}` : null,
            homeClubNameAtMatchTime: hostClub?.name ?? null
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
            status: "scheduled" as const,
            venueClubId: hostClub?.id ?? null,
            homeClubNameAtMatchTime: hostClub?.name ?? null
          }
        });
      }

      const byeMatches = await prisma.match.findMany({
        where: {
          competitionId: competition.id,
          competitionCategoryId: competitionCategory.id,
          matchType: "tournament_knockout",
          status: "bye",
          winnerPlayerId: { not: null }
        },
        select: { id: true, winnerPlayerId: true },
        orderBy: { bracketPosition: "asc" }
      });

      for (const byeMatch of byeMatches) {
        await advanceTournamentResult(byeMatch.id, byeMatch.winnerPlayerId);
      }
    }
  }

  revalidatePath("/manager/tournaments");
  revalidatePath(`/tournaments/${competition.id}`);
  revalidatePath(`/tournaments/${competition.id}/edit`);
}

export async function registerSelfForTournamentAction(formData: FormData) {
  if (!(await isFeatureEnabled("tournament_online_registration"))) {
    throw new Error("La inscripción online a torneos no está activa.");
  }
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
  if (!(await isFeatureEnabled("tournament_online_registration"))) {
    throw new Error("La inscripción online a torneos no está activa.");
  }
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
  if (!(await isFeatureEnabled("tournaments"))) {
    throw new Error("La gestión de torneos no está activa.");
  }
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
  if (!(await isFeatureEnabled("tournaments"))) {
    throw new Error("La gestión de torneos no está activa.");
  }
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

  const players = competitionCategory.participants.flatMap((participant) => participant.player ? [participant.player] : []);
  const rankingRows = competitionCategory.competition.rankingScope === "none"
    ? []
    : await getTournamentRankingRows(competitionCategory.competition.rankingCode, players.map((player) => player.id));
  const rankingPositions = new Map(rankingRows.map((row, index) => [row.playerId, { ...row, index }]));
  const hasRankingScores = rankingRows.some((row) => row.points > 0);
  const seedPlayerIds = players
    .map((player) => ({ player, ranking: rankingPositions.get(player.id) }))
    .sort((left, right) =>
      (hasRankingScores
        ? (left.ranking?.index ?? Number.MAX_SAFE_INTEGER) - (right.ranking?.index ?? Number.MAX_SAFE_INTEGER)
        : 0) ||
      left.player.lastName.localeCompare(right.player.lastName) ||
      left.player.firstName.localeCompare(right.player.firstName)
    )
    .slice(0, Math.min(8, players.length))
    .map(({ player }) => player.id);

  await saveTournamentSeeds(parsed.competitionCategoryId, seedPlayerIds);
}

export async function saveTeamAction(formData: FormData) {
  if (!(await isFeatureEnabled("teams"))) {
    throw new Error("La gestión de equipos no está activa.");
  }
  const currentUser = await requireUser();
  const isAdmin = hasRole(currentUser, "admin");
  const parsed = teamSchema.parse({
    teamId: textValue(formData.get("teamId")),
    name: textValue(formData.get("name")),
    showRosterPublic: formData.get("showRosterPublic") === "on"
  });
  const team = await prisma.team.findUniqueOrThrow({
    where: { id: parsed.teamId },
    include: { club: true, rosters: { select: { playerId: true } } }
  });

  if (!isAdmin && team.club.managerUserId !== currentUser.id) {
    throw new Error("Solo puedes modificar equipos de tu club.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.team.update({
      where: { id: parsed.teamId },
      data: {
        name: parsed.name,
        showRosterPublic: parsed.showRosterPublic
      }
    });

    await tx.teamRoster.updateMany({
      where: {
        teamId: parsed.teamId,
        seasonId: team.seasonId
      },
      data: {
        teamNameAtThatTime: parsed.name,
        clubNameAtThatTime: team.club.name
      }
    });

    await tx.teamTie.updateMany({
      where: { homeTeamId: parsed.teamId, seasonId: team.seasonId },
      data: {
        homeTeamNameAtTime: parsed.name,
        homeClubNameAtTime: team.club.name
      }
    });

    await tx.teamTie.updateMany({
      where: { awayTeamId: parsed.teamId, seasonId: team.seasonId },
      data: {
        awayTeamNameAtTime: parsed.name,
        awayClubNameAtTime: team.club.name
      }
    });

    await tx.match.updateMany({
      where: { homeTeamIdAtMatchTime: parsed.teamId, seasonId: team.seasonId },
      data: {
        homeTeamNameAtMatchTime: parsed.name,
        homeClubNameAtMatchTime: team.club.name
      }
    });

    await tx.match.updateMany({
      where: { awayTeamIdAtMatchTime: parsed.teamId, seasonId: team.seasonId },
      data: {
        awayTeamNameAtMatchTime: parsed.name,
        awayClubNameAtMatchTime: team.club.name
      }
    });
  });

  revalidatePath(`/teams/${parsed.teamId}`);
  revalidatePath(`/teams/${parsed.teamId}/edit`);
  team.rosters.forEach((roster) => revalidatePath(`/players/${roster.playerId}`));
  redirect(`/teams/${parsed.teamId}`);
}

export async function saveFeatureSettingsAction(formData: FormData) {
  const currentUser = await requireUser();
  if (!hasRole(currentUser, "admin")) {
    throw new Error("Solo un admin puede modificar la configuración de la aplicación.");
  }

  const parsed = featureSettingsSchema.parse({
    enabledFeatures: toArray(formData, "enabledFeatures")
  });
  const enabled = new Set(parsed.enabledFeatures);

  await prisma.$transaction(
    featureKeys.map((featureKey) =>
      prisma.appFeatureSetting.upsert({
        where: { featureKey },
        update: {
          enabled: enabled.has(featureKey),
          updatedByUserId: currentUser.id
        },
        create: {
          featureKey,
          enabled: enabled.has(featureKey),
          updatedByUserId: currentUser.id
        }
      })
    )
  );

  revalidatePath("/");
  revalidatePath("/admin/settings");
  revalidatePath("/admin/leagues");
  revalidatePath("/manager/tournaments");
  revalidatePath("/rankings");
  redirect("/admin/settings?saved=1");
}

export async function reserveCourtAction(formData: FormData) {
  const currentUser = await requireUser();
  if (!(await isFeatureEnabled("court_bookings"))) {
    throw new Error("La gestión de reservas no está activa.");
  }

  const parsed = courtReservationSchema.parse({
    clubId: textValue(formData.get("clubId")),
    courtNumber: textValue(formData.get("courtNumber")),
    startsAt: textValue(formData.get("startsAt"))
  });
  const startsAt = new Date(parsed.startsAt);
  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);

  if (!isBookableCourtSlot(startsAt)) {
    throw new Error("La franja seleccionada no se puede reservar.");
  }

  const club = await prisma.club.findUniqueOrThrow({
    where: { id: parsed.clubId },
    select: { id: true, availableCourts: true, managesCourtBookings: true }
  });

  if (!club.managesCourtBookings || club.availableCourts < parsed.courtNumber) {
    throw new Error("Este club no permite reservar esta pista desde la app.");
  }

  const slotDay = new Date(`${courtDateKey(startsAt)}T00:00:00.000Z`);
  const closedDay = await prisma.courtClosedDay.findUnique({
    where: {
      clubId_closedOn: {
        clubId: club.id,
        closedOn: slotDay
      }
    },
    select: { id: true }
  });

  if (closedDay) {
    throw new Error("El club está cerrado en la fecha seleccionada.");
  }

  const player = await prisma.player.findUnique({
    where: { userId: currentUser.id },
    select: { id: true }
  });
  const activeFutureReservation = await prisma.courtReservation.findFirst({
    where: {
      userId: currentUser.id,
      status: "active",
      startsAt: { gte: new Date() }
    },
    select: { id: true }
  });

  if (activeFutureReservation) {
    throw new Error("Ya tienes una reserva vigente.");
  }

  const sameDayStart = courtLocalDateTimeToUtc(courtDateKey(startsAt));
  const sameDayEnd = courtLocalDateTimeToUtc(addDaysToCourtDateKey(courtDateKey(startsAt), 1));
  const sameDayReservation = await prisma.courtReservation.findFirst({
    where: {
      userId: currentUser.id,
      status: "active",
      startsAt: { gte: sameDayStart, lt: sameDayEnd }
    },
    select: { id: true }
  });

  if (sameDayReservation) {
    throw new Error("Solo puedes reservar una hora de pista al día.");
  }

  await prisma.courtReservation.create({
    data: {
      clubId: club.id,
      courtNumber: parsed.courtNumber,
      userId: currentUser.id,
      playerId: player?.id ?? null,
      partnerPlayerId: null,
      startsAt,
      endsAt,
      createdByUserId: currentUser.id,
      updatedByUserId: currentUser.id
    }
  });

  revalidatePath(`/clubs/${club.id}`);
}

export async function cancelCourtReservationAction(formData: FormData) {
  const currentUser = await requireUser();
  if (!(await isFeatureEnabled("court_bookings"))) {
    throw new Error("La gestión de reservas no está activa.");
  }

  const parsed = cancelCourtReservationSchema.parse({
    reservationId: textValue(formData.get("reservationId")),
    clubId: textValue(formData.get("clubId"))
  });
  const reservation = await prisma.courtReservation.findUniqueOrThrow({
    where: { id: parsed.reservationId },
    include: { club: true }
  });
  const isAdmin = hasRole(currentUser, "admin");
  const canManageClub = reservation.club.managerUserId === currentUser.id;

  if (!isAdmin && !canManageClub && reservation.userId !== currentUser.id) {
    throw new Error("No puedes cancelar esta reserva.");
  }

  await prisma.courtReservation.update({
    where: { id: reservation.id },
    data: {
      status: "cancelled",
      cancelledAt: new Date(),
      cancelledByUserId: currentUser.id,
      updatedByUserId: currentUser.id
    }
  });

  revalidatePath(`/clubs/${parsed.clubId}`);
}

export async function saveMatchResultAction(formData: FormData) {
  if (!(await isFeatureEnabled("player_result_entry"))) {
    throw new Error("La introducción de resultados por jugadores no está activa.");
  }
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
