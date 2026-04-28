import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const password = "TestUser1234";
const passwordHash = await bcrypt.hash(password, 12);

const clubNames = [
  "Club Tramuntana Squash",
  "Roc Verd Squash",
  "Diagonal Court Club",
  "Mar Blau Squash",
  "Valles Racket House",
  "Montclar Squash Team",
  "Eixample Glass Court",
  "Llevant Squash Academy"
];

const firstNames = [
  "Arnau", "Berta", "Clara", "Dani", "Elena", "Ferran", "Gina", "Hugo",
  "Irene", "Jan", "Laia", "Marc", "Nora", "Oriol", "Paula", "Quim",
  "Rita", "Sergi", "Tania", "Unai", "Vera", "Xavi", "Yasmina", "Zoel"
];
const lastNames = [
  "Serra", "Puig", "Vidal", "Costa", "Ribas", "Soler", "Marti", "Ferrer",
  "Pons", "Roca", "Mas", "Duran", "Bosch", "Marin", "Gil", "Mora"
];
const rackets = ["Tecnifibre", "Dunlop", "Head", "Karakal", "Prince", "Oliver"];
const provinces = ["Barcelona", "Girona", "Tarragona", "Lleida"];

function pick(items, index) {
  return items[index % items.length];
}

async function getSeason() {
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

async function getCategory() {
  const found = await prisma.category.findFirst({
    where: { name: "General", genderScope: "not_specified" }
  });

  return found ?? prisma.category.create({
    data: { name: "General", genderScope: "not_specified", sortOrder: 1 }
  });
}

async function upsertUser({ email, displayName, phone, locale = "es" }) {
  const user = await prisma.user.upsert({
    where: { email },
    update: { displayName, phone, emailVerified: true, preferredLocale: locale },
    create: {
      firebaseUid: `local:${email}`,
      email,
      displayName,
      phone,
      emailVerified: true,
      preferredLocale: locale
    }
  });

  await prisma.authCredential.upsert({
    where: { userId: user.id },
    update: { passwordHash, passwordChangedAt: new Date() },
    create: { userId: user.id, passwordHash }
  });

  await prisma.userRoleAssignment.upsert({
    where: { userId_role: { userId: user.id, role: "player" } },
    update: {},
    create: { userId: user.id, role: "player" }
  });

  return user;
}

async function main() {
  const season = await getSeason();
  const category = await getCategory();

  for (const [clubIndex, clubName] of clubNames.entries()) {
    const managerFirstName = pick(firstNames, clubIndex * 12);
    const managerLastName = `${pick(lastNames, clubIndex * 12)} ${pick(lastNames, clubIndex * 12 + 5)}`;
    const managerEmail = `manager.${clubIndex + 1}@demo.squash.local`;
    const manager = await upsertUser({
      email: managerEmail,
      displayName: `${managerFirstName} ${managerLastName}`,
      phone: `+34 650 10 ${String(clubIndex + 1).padStart(2, "0")} 00`,
      locale: clubIndex % 3 === 0 ? "ca" : clubIndex % 3 === 1 ? "es" : "en"
    });

    await prisma.userRoleAssignment.upsert({
      where: { userId_role: { userId: manager.id, role: "manager" } },
      update: {},
      create: { userId: manager.id, role: "manager" }
    });

    const club = await prisma.club.upsert({
      where: { name: clubName },
      update: {
        city: pick(["Barcelona", "Girona", "Tarragona", "Lleida"], clubIndex),
        province: pick(provinces, clubIndex),
        address: `Carrer Central ${clubIndex + 10}`,
        managerUserId: manager.id
      },
      create: {
        name: clubName,
        city: pick(["Barcelona", "Girona", "Tarragona", "Lleida"], clubIndex),
        province: pick(provinces, clubIndex),
        address: `Carrer Central ${clubIndex + 10}`,
        managerUserId: manager.id
      }
    });

    await prisma.$executeRaw`
      INSERT INTO club_season_profiles (club_id, season_id, display_name)
      VALUES (${club.id}::uuid, ${season.id}::uuid, ${club.name})
      ON CONFLICT (club_id, season_id)
      DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = now()
    `;

    const playerCount = 8 + (clubIndex % 5);
    const players = [];

    for (let playerIndex = 0; playerIndex < playerCount; playerIndex += 1) {
      const globalIndex = clubIndex * 12 + playerIndex;
      const firstName = pick(firstNames, globalIndex);
      const lastName = `${pick(lastNames, globalIndex)} ${pick(lastNames, globalIndex + 5)}`;
      const email = `${firstName}.${lastName}`.toLowerCase().replaceAll(" ", ".") + `.${clubIndex + 1}@demo.squash.local`;
      const user = playerIndex === 0
        ? manager
        : await upsertUser({
            email,
            displayName: `${firstName} ${lastName}`,
            phone: `+34 600 ${String(clubIndex + 1).padStart(2, "0")} ${String(playerIndex + 10).padStart(2, "0")} ${String(globalIndex % 90).padStart(2, "0")}`,
            locale: pick(["ca", "es", "en"], globalIndex)
          });

      const player = await prisma.player.upsert({
        where: { userId: user.id },
        update: {
          firstName,
          lastName,
          gender: playerIndex % 2 === 0 ? "male" : "female",
          dominantHand: playerIndex % 5 === 0 ? "left" : "right",
          heightCm: 160 + (globalIndex % 32),
          weightKg: 55 + (globalIndex % 34),
          racketBrand: pick(rackets, globalIndex)
        },
        create: {
          userId: user.id,
          firstName,
          lastName,
          gender: playerIndex % 2 === 0 ? "male" : "female",
          dominantHand: playerIndex % 5 === 0 ? "left" : "right",
          heightCm: 160 + (globalIndex % 32),
          weightKg: 55 + (globalIndex % 34),
          racketBrand: pick(rackets, globalIndex)
        }
      });

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

      players.push(player);
    }

    const team = await prisma.team.upsert({
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
    });

    for (const player of players) {
      await prisma.teamRoster.upsert({
        where: {
          teamId_playerId_seasonId_categoryId: {
            teamId: team.id,
            playerId: player.id,
            seasonId: season.id,
            categoryId: category.id
          }
        },
        update: {
          teamNameAtThatTime: team.name,
          clubNameAtThatTime: club.name,
          playerNameAtThatTime: `${player.firstName} ${player.lastName}`
        },
        create: {
          teamId: team.id,
          playerId: player.id,
          seasonId: season.id,
          categoryId: category.id,
          teamNameAtThatTime: team.name,
          clubNameAtThatTime: club.name,
          playerNameAtThatTime: `${player.firstName} ${player.lastName}`,
          fromDate: season.startsAt
        }
      });
    }
  }

  console.log("Seeded demo clubs, players and managers");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
