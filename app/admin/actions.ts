"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/src/lib/prisma";
import { generateRoundRobin, nextPowerOfTwo, shuffle } from "@/src/lib/schedule";

const testPassword = "TestUser1234";

const playerSchema = z.object({
  playerId: z.string().uuid().optional().or(z.literal("")),
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(6),
  emailVerified: z.coerce.boolean().default(false),
  preferredLocale: z.enum(["ca", "es", "en"]).default("es"),
  gender: z.enum(["male", "female", "other", "not_specified"]),
  dominantHand: z.enum(["right", "left", "ambidextrous", "not_specified"]),
  heightCm: z.coerce.number().int().min(90).max(240).optional().or(z.literal("")),
  weightKg: z.coerce.number().min(20).max(250).optional().or(z.literal("")),
  racketBrand: z.string().optional(),
  clubId: z.string().uuid().optional().or(z.literal(""))
});

const clubSchema = z.object({
  clubId: z.string().uuid().optional().or(z.literal("")),
  name: z.string().min(3),
  city: z.string().optional(),
  address: z.string().optional(),
  websiteUrl: z.string().url().optional().or(z.literal("")),
  managerUserId: z.string().uuid().optional().or(z.literal(""))
});

const competitionSchema = z.object({
  competitionId: z.string().uuid().optional().or(z.literal("")),
  name: z.string().min(3),
  description: z.string().optional(),
  type: z.enum(["individual_league", "team_league"]),
  startsAt: z.string().min(10),
  endsAt: z.string().min(10),
  participantIds: z.array(z.string().uuid()).default([])
});

const tournamentSchema = z.object({
  competitionId: z.string().uuid().optional().or(z.literal("")),
  name: z.string().min(3),
  description: z.string().optional(),
  hostClubId: z.string().uuid(),
  startsAt: z.string().min(10),
  endsAt: z.string().min(10),
  participantIds: z.array(z.string().uuid()).default([]),
  seedPlayerIds: z.array(z.string().uuid()).default([])
});

function textValue(value: unknown) {
  return value?.toString().trim() || undefined;
}

function toArray(formData: FormData, key: string) {
  return formData.getAll(key).map(String).filter(Boolean);
}

async function getDefaultSeason() {
  return prisma.season.upsert({
    where: { name: "2026/27" },
    update: {},
    create: {
      name: "2026/27",
      startsAt: new Date("2026-09-01"),
      endsAt: new Date("2027-06-30"),
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

export async function savePlayerAction(formData: FormData) {
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
    clubId: textValue(formData.get("clubId")) ?? ""
  });

  const displayName = `${parsed.firstName} ${parsed.lastName}`;
  const user = await prisma.user.upsert({
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
          racketBrand: parsed.racketBrand
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
          racketBrand: parsed.racketBrand
        }
      });

  if (parsed.clubId) {
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
}

export async function saveClubAction(formData: FormData) {
  const parsed = clubSchema.parse({
    clubId: textValue(formData.get("clubId")),
    name: textValue(formData.get("name")),
    city: textValue(formData.get("city")),
    address: textValue(formData.get("address")),
    websiteUrl: textValue(formData.get("websiteUrl")) ?? "",
    managerUserId: textValue(formData.get("managerUserId")) ?? ""
  });

  const club = parsed.clubId
    ? await prisma.club.update({
        where: { id: parsed.clubId },
        data: {
          name: parsed.name,
          city: parsed.city,
          address: parsed.address,
          websiteUrl: parsed.websiteUrl || null,
          managerUserId: parsed.managerUserId || null
        }
      })
    : await prisma.club.create({
        data: {
          name: parsed.name,
          city: parsed.city,
          address: parsed.address,
          websiteUrl: parsed.websiteUrl || null,
          managerUserId: parsed.managerUserId || null
        }
      });

  if (parsed.managerUserId) {
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
  const parsed = competitionSchema.parse({
    competitionId: textValue(formData.get("competitionId")),
    name: textValue(formData.get("name")),
    description: textValue(formData.get("description")),
    type: textValue(formData.get("type")) ?? "individual_league",
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
          status: "draft",
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
  const parsed = tournamentSchema.parse({
    competitionId: textValue(formData.get("competitionId")),
    name: textValue(formData.get("name")),
    description: textValue(formData.get("description")),
    hostClubId: textValue(formData.get("hostClubId")),
    startsAt: textValue(formData.get("startsAt")),
    endsAt: textValue(formData.get("endsAt")),
    participantIds: toArray(formData, "participantIds"),
    seedPlayerIds: toArray(formData, "seedPlayerIds")
  });

  const season = await getDefaultSeason();
  const category = await getDefaultCategory();
  const competition = parsed.competitionId
    ? await prisma.competition.update({
        where: { id: parsed.competitionId },
        data: {
          name: parsed.name,
          description: parsed.description,
          hostClubId: parsed.hostClubId,
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
    update: { format: parsed.participantIds.length < 8 ? "round_robin" : "knockout" },
    create: {
      competitionId: competition.id,
      categoryId: category.id,
      format: parsed.participantIds.length < 8 ? "round_robin" : "knockout"
    }
  });

  await prisma.competitionParticipant.deleteMany({
    where: { competitionCategoryId: competitionCategory.id }
  });
  await prisma.tournamentRegistration.deleteMany({
    where: { competitionCategoryId: competitionCategory.id }
  });
  await prisma.tournamentSeed.deleteMany({
    where: { competitionCategoryId: competitionCategory.id }
  });
  await prisma.tournamentDrawEntry.deleteMany({
    where: { competitionCategoryId: competitionCategory.id }
  });
  await prisma.match.deleteMany({ where: { competitionId: competition.id } });

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

  await prisma.tournamentRegistration.createMany({
    data: players.map((player) => ({
      competitionCategoryId: competitionCategory.id,
      playerId: player.id,
      clubIdAtRegistration: player.memberships[0]?.clubId ?? null,
      playerNameAtRegistration: `${player.firstName} ${player.lastName}`,
      clubNameAtRegistration: player.memberships[0]?.club.name ?? null,
      status: "accepted"
    }))
  });

  const seeds = parsed.seedPlayerIds
    .map((playerId, index) => players.find((player) => player.id === playerId) && { playerId, index })
    .filter(Boolean) as Array<{ playerId: string; index: number }>;

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

  const format = parsed.participantIds.length < 8 ? "round_robin" : "knockout";
  if (format === "round_robin") {
    const rounds = generateRoundRobin(shuffle(players));
    await prisma.match.createMany({
      data: rounds.flatMap((round, roundIndex) =>
        round.map(([home, away], matchIndex) => ({
          seasonId: season.id,
          competitionId: competition.id,
          competitionCategoryId: competitionCategory.id,
          matchType: "tournament_round_robin",
          roundNumber: roundIndex + 1,
          matchOrder: matchIndex + 1,
          status: "scheduled",
          homePlayerId: home.id,
          awayPlayerId: away.id,
          homePlayerNameAtMatchTime: `${home.firstName} ${home.lastName}`,
          awayPlayerNameAtMatchTime: `${away.firstName} ${away.lastName}`
        }))
      )
    });
  } else {
    const bracketSize = nextPowerOfTwo(players.length);
    const seededPlayers = seeds
      .map((seed) => players.find((player) => player.id === seed.playerId))
      .filter(Boolean);
    const remaining = shuffle(players.filter((player) => !seeds.some((seed) => seed.playerId === player.id)));
    const ordered = [...seededPlayers, ...remaining] as typeof players;
    const entries = Array.from({ length: bracketSize }, (_, index) => ordered[index] ?? null);

    await prisma.tournamentDrawEntry.createMany({
      data: entries.map((player, index) => ({
        competitionCategoryId: competitionCategory.id,
        playerId: player?.id ?? null,
        playerNameAtTime: player ? `${player.firstName} ${player.lastName}` : null,
        seedNumber: player
          ? ((seeds.find((seed) => seed.playerId === player.id)?.index ?? -1) + 1 || null)
          : null,
        bracketPosition: index + 1,
        isBye: !player
      }))
    });

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
          status: home && away ? "scheduled" : "bye",
          homePlayerId: home?.id ?? null,
          awayPlayerId: away?.id ?? null,
          winnerPlayerId: home && !away ? home.id : !home && away ? away.id : null,
          homePlayerNameAtMatchTime: home ? `${home.firstName} ${home.lastName}` : null,
          awayPlayerNameAtMatchTime: away ? `${away.firstName} ${away.lastName}` : null
        };
      })
    });
  }

  revalidatePath("/manager/tournaments");
}
