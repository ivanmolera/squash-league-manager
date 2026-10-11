"use server";

import { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { hashSessionToken, getCurrentUser } from "@/src/lib/auth";
import { appBaseUrl, sendTransactionalEmail } from "@/src/lib/email";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";

const accountOnlySchema = z.object({
  firstName: z.string().trim().min(2),
  lastName: z.string().trim().min(2),
  email: z.string().trim().email(),
  role: z.enum(["player", "manager", "manager_fed"])
});

export type CreateAccountOnlyState = {
  error?: string;
  success?: string;
  invitationUrl?: string;
  values?: { firstName: string; lastName: string; email: string; role: string };
};

export async function createAccountOnlyAction(_state: CreateAccountOnlyState, formData: FormData): Promise<CreateAccountOnlyState> {
  const actor = await getCurrentUser();
  if (!actor?.roles.some((role) => role.role === "admin")) {
    throw new Error("Only an administrator can create accounts.");
  }

  const { locale, t } = await getDictionary();
  const values = {
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? "player")
  };
  const parsed = accountOnlySchema.safeParse(values);
  if (!parsed.success) return { error: t.accountOnlyInvalid, values };

  const email = parsed.data.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) {
    return { error: t.registrationEmailExists, values };
  }

  const token = randomBytes(32).toString("base64url");
  const invitationUrl = `${appBaseUrl()}/reset-password?token=${encodeURIComponent(token)}&invite=1`;
  let user;
  try {
    user = await prisma.user.create({
      data: {
        firebaseUid: `local:${email}`,
        email,
        emailVerified: false,
        displayName: `${parsed.data.firstName} ${parsed.data.lastName}`,
        preferredLocale: locale,
        roles: { create: [
          { role: "player" },
          ...(parsed.data.role === "player" ? [] : [{ role: parsed.data.role }])
        ] },
        passwordResetTokens: { create: {
          tokenHash: hashSessionToken(token),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        } }
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: t.registrationEmailExists, values };
    }
    throw error;
  }

  try {
    const result = await sendTransactionalEmail({
      to: email,
      subject: t.accountInvitationSubject,
      text: `${t.accountInvitationText}\n\n${invitationUrl}`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a;max-width:560px"><h1>SquashFlow</h1><p>${t.accountInvitationText}</p><p><a href="${invitationUrl}">${t.activateAccount}</a></p><p>${invitationUrl}</p></div>`
    });
    if (!result.sent) {
      if (process.env.NODE_ENV === "production") throw new Error("Transactional email is not configured.");
      return { success: t.accountOnlyCreated, invitationUrl: `/reset-password?token=${encodeURIComponent(token)}&invite=1` };
    }
  } catch (error) {
    console.error("Account invitation send failed", error);
    await prisma.user.delete({ where: { id: user.id } });
    return { error: t.accountInvitationSendFailed, values };
  }

  return { success: t.accountOnlyCreated };
}
