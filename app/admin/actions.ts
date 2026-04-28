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
  profilePhotoUrl: z.string().optional()
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
  matchId: z.string().uuid(),
  setScores: z.string().min(5)
});

const removeClubPlayerSchema = z.object({
  membershipId: z.string().uuid(),
  clubId: z.string().uuid()
});

const tournamentRegistrationSchema = z.object({
  competitionCategoryId: z.string().uuid(),
  playerId: z.string().uuid().optional()
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

function parseSetScores(value: string) {
  const sets = value
    .split(/[,\n;]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item, index) => {
      const match = item.match(/^(\d{1,2})\s*[-/]\s*(\d{1,2})$/);

      if (!match) {
        throw new Error("Introduce los sets con formato 11-8, 11-9, 11-7.");
      }

      const homePoints = Number(match[1]);
      const awayPoints = Number(match[2]);
      const winnerPoints = Math.max(homePoints, awayPoints);
      const pointDiff = Math.abs(homePoints - awayPoints);

      if (homePoints === awayPoints || winnerPoints < 11 || pointDiff < 2) {
        throw new Error("Cada set debe ganarse con al menos 11 puntos y 2 puntos de diferencia.");
      }

      return { setNumber: index + 1, homePoints, awayPoints };
    });

  if (sets.length < 3 || sets.length > 5) {
    throw new Error("Un partido debe tener entre 3 y 5 sets.");
  }

  const homeSets = sets.filter((set) => set.homePoints > set.awayPoints).length;
  const awaySets = sets.filter((set) => set.awayPoints > set.homePoints).length;

  if (homeSets !== 3 && awaySets !== 3) {
    throw new Error("El resultado debe dejar un ganador con 3 sets.");
  }

  if (sets.length > homeSets + awaySets) {
    throw new Error("Resultado de sets no válido.");
  }

  return { sets, homeSets, awaySets };
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
    include: { memberships: { where: { toDate: null }, include: { club: true }, take: 1 } }
  });

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
      update: { status: "accepted" },
      create: {
        competitionCategoryId,
        playerId,
        clubIdAtRegistration: player.memberships[0]?.clubId ?? null,
        playerNameAtRegistration: `${player.firstName} ${player.lastName}`,
        clubNameAtRegistration: player.memberships[0]?.club.name ?? null,
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
          profilePhotoUrl: parsed.profilePhotoUrl || null,
          genericProfileVariant: genericProfileVariant(parsed.gender),
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
  const shouldGenerateDraw = formData.get("mode")?.toString() === "generate";
  const parsed = tournamentSchema.parse({
    competitionId: textValue(formData.get("competitionId")),
    name: textValue(formData.get("name")),
    description: textValue(formData.get("description")),
    hostClubId: textValue(formData.get("hostClubId")),
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

  if (!shouldGenerateDraw) {
    revalidatePath("/manager/tournaments");
    revalidatePath(`/tournaments/${competition.id}`);
    revalidatePath(`/tournaments/${competition.id}/edit`);
    return;
  }

  const competitionCategories = await prisma.competitionCategory.findMany({
    where: { competitionId: competition.id },
    orderBy: { createdAt: "asc" }
  });

  for (const competitionCategory of competitionCategories) {
    const participants = await prisma.competitionParticipant.findMany({
      where: { competitionCategoryId: competitionCategory.id, playerId: { not: null } },
      include: { player: true },
      orderBy: { createdAt: "asc" }
    });
    const players = participants.flatMap((participant) => participant.player ? [participant.player] : []);
    const seedPlayerIds = parsed.seedEntries
      .map((entry) => {
        const [categoryId, playerId] = entry.split(":");
        return categoryId === competitionCategory.id ? playerId : null;
      })
      .filter(Boolean) as string[];
    const seeds = seedPlayerIds
      .map((playerId, index) => players.find((player) => player.id === playerId) && { playerId, index })
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
      const seededPlayers = seeds
        .map((seed) => players.find((player) => player.id === seed.playerId))
        .filter((player): player is typeof players[number] => Boolean(player));
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
            status: home && away ? "scheduled" as const : "bye" as const,
            homePlayerId: home?.id ?? null,
            awayPlayerId: away?.id ?? null,
            winnerPlayerId: home && !away ? home.id : !home && away ? away.id : null,
            homePlayerNameAtMatchTime: home ? `${home.firstName} ${home.lastName}` : null,
            awayPlayerNameAtMatchTime: away ? `${away.firstName} ${away.lastName}` : null
          };
        })
      });
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
    matchId: textValue(formData.get("matchId")),
    setScores: textValue(formData.get("setScores"))
  });

  await assertCanEditMatchResult(parsed.matchId, currentUser);

  const match = await prisma.match.findUniqueOrThrow({
    where: { id: parsed.matchId },
    select: {
      id: true,
      competitionId: true,
      homePlayerId: true,
      awayPlayerId: true
    }
  });

  const { sets, homeSets, awaySets } = parseSetScores(parsed.setScores);
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
