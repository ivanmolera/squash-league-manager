"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  createSessionToken,
  hashSessionToken,
  setSessionCookie
} from "@/src/lib/auth";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export type LoginState = {
  error?: string;
};

export async function loginAction(_state: LoginState, formData: FormData): Promise<LoginState> {
  const { t } = await getDictionary();
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password")
  });

  if (!parsed.success) {
    return { error: t.invalidEmailPassword };
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
    include: {
      credential: true
    }
  });

  if (!user?.credential) {
    return { error: t.invalidCredentials };
  }

  if (!user.emailVerified) {
    return { error: t.emailNotVerified };
  }

  const isValidPassword = await bcrypt.compare(
    parsed.data.password,
    user.credential.passwordHash
  );

  if (!isValidPassword) {
    return { error: t.invalidCredentials };
  }

  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

  await prisma.authSession.create({
    data: {
      userId: user.id,
      tokenHash: hashSessionToken(token),
      expiresAt
    }
  });

  await setSessionCookie(token, expiresAt);
  redirect("/dashboard");
}
