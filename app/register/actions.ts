"use server";

import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { hashSessionToken } from "@/src/lib/auth";
import { isFeatureEnabled } from "@/src/lib/features";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";

const registerSchema = z.object({
  firstName: z.string().trim().min(2),
  lastName: z.string().trim().min(2),
  email: z.string().trim().email(),
  password: z.string().min(8),
  confirmPassword: z.string().min(8)
}).refine((value) => value.password === value.confirmPassword, {
  path: ["confirmPassword"]
});

export type RegisterState = {
  error?: string;
  success?: string;
  verificationUrl?: string;
};

function createEmailVerificationToken() {
  return randomBytes(32).toString("base64url");
}

export async function registerPlayerAction(_state: RegisterState, formData: FormData): Promise<RegisterState> {
  const { locale, t } = await getDictionary();
  if (!(await isFeatureEnabled("public_registration"))) {
    return { error: t.unavailable };
  }

  const parsed = registerSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword")
  });

  if (!parsed.success) {
    return { error: t.registrationInvalid };
  }

  const email = parsed.data.email.toLowerCase();
  const existingUser = await prisma.user.findUnique({ where: { email } });

  if (existingUser) {
    return { error: t.registrationEmailExists };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const token = createEmailVerificationToken();
  const tokenHash = hashSessionToken(token);
  const displayName = `${parsed.data.firstName} ${parsed.data.lastName}`;
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

  await prisma.user.create({
    data: {
      firebaseUid: `local:${email}`,
      email,
      emailVerified: false,
      displayName,
      preferredLocale: locale,
      credential: {
        create: {
          passwordHash
        }
      },
      roles: {
        create: {
          role: "player"
        }
      },
      player: {
        create: {
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
          genericProfileVariant: "neutral",
          showContactPublic: false,
          showPhysicalPublic: false
        }
      },
      emailVerificationTokens: {
        create: {
          tokenHash,
          expiresAt
        }
      }
    }
  });

  return {
    success: t.registrationCreated,
    verificationUrl: `/verify-email?token=${encodeURIComponent(token)}`
  };
}
