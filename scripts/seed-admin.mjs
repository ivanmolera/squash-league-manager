import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const email = "ivan.molera@gmail.com";
const password = "Test1234";

async function main() {
  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      displayName: "Ivan Molera"
    },
    create: {
      firebaseUid: `local:${email}`,
      email,
      displayName: "Ivan Molera"
    }
  });

  await prisma.userRoleAssignment.upsert({
    where: {
      userId_role: {
        userId: user.id,
        role: "admin"
      }
    },
    update: {},
    create: {
      userId: user.id,
      role: "admin"
    }
  });

  await prisma.authCredential.upsert({
    where: { userId: user.id },
    update: {
      passwordHash,
      passwordChangedAt: new Date()
    },
    create: {
      userId: user.id,
      passwordHash
    }
  });

  console.log(`Seeded admin user ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
