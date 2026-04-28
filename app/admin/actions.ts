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
  clubId: z.string().uuid().optional().or(z.literal(""))
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
  registrationDeadline: z.string().min(10),
  startsAt: z.string().min(10),
  endsAt: z.string().min(10),
  participantIds: z.array(z.string().uuid()).default([]),
  seedPlayerIds: z.array(z.string().uuid()).default([])
});

const teamSchema = z.object({
  teamId: z.string().uuid(),
  name: z.string().min(3),
  showRosterPublic: z.coerce.boolean().default(false)
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

export async function savePlayerAction(formData: FormData) {
  const currentUser = await requireUser();
  const isAdmin = hasRole(currentUser, "admin");
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
    clubId: textValue(formData.get("clubId")) ?? ""
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
          showContactPublic: parsed.showContactPublic,
          showPhysicalPublic: parsed.showPhysicalPublic
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
          showContactPublic: parsed.showContactPublic,
          showPhysicalPublic: parsed.showPhysicalPublic
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
  const parsed = tournamentSchema.parse({
    competitionId: textValue(formData.get("competitionId")),
    name: textValue(formData.get("name")),
    description: textValue(formData.get("description")),
    hostClubId: textValue(formData.get("hostClubId")),
    registrationDeadline: textValue(formData.get("registrationDeadline")),
    startsAt: textValue(formData.get("startsAt")),
    endsAt: textValue(formData.get("endsAt")),
    participantIds: toArray(formData, "participantIds"),
    seedPlayerIds: toArray(formData, "seedPlayerIds")
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
  const category = await getDefaultCategory();
  const competition = parsed.competitionId
    ? await prisma.competition.update({
        where: { id: parsed.competitionId },
        data: {
          name: parsed.name,
          description: parsed.description,
          hostClubId: parsed.hostClubId,
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
