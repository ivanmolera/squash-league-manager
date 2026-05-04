"use server";

import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { hashSessionToken } from "@/src/lib/auth";
import { appBaseUrl, sendTransactionalEmail } from "@/src/lib/email";
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
  values?: {
    firstName?: string;
    lastName?: string;
    email?: string;
  };
};

function createEmailVerificationToken() {
  return randomBytes(32).toString("base64url");
}

function verificationEmailHtml({ title, text, cta, url }: { title: string; text: string; cta: string; url: string }) {
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

export async function registerPlayerAction(_state: RegisterState, formData: FormData): Promise<RegisterState> {
  const { locale, t } = await getDictionary();
  const values = {
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    email: String(formData.get("email") ?? "")
  };

  if (!(await isFeatureEnabled("public_registration"))) {
    return { error: t.unavailable, values };
  }

  const parsed = registerSchema.safeParse({
    firstName: values.firstName,
    lastName: values.lastName,
    email: values.email,
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword")
  });

  if (!parsed.success) {
    const hasPasswordMismatch = parsed.error.issues.some((issue) => issue.path.join(".") === "confirmPassword" && issue.code === "custom");
    return { error: hasPasswordMismatch ? t.passwordsDoNotMatch : t.registrationInvalid, values };
  }

  const email = parsed.data.email.toLowerCase();
  const existingUser = await prisma.user.findUnique({ where: { email } });

  if (existingUser) {
    return { error: t.registrationEmailExists, values };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const token = createEmailVerificationToken();
  const tokenHash = hashSessionToken(token);
  const displayName = `${parsed.data.firstName} ${parsed.data.lastName}`;
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

  const user = await prisma.user.create({
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
    },
    include: { player: true }
  });

  const verificationUrl = `${appBaseUrl()}/verify-email?token=${encodeURIComponent(token)}`;

  try {
    const emailResult = await sendTransactionalEmail({
      to: email,
      subject: t.emailVerificationSubject,
      text: `${t.emailVerificationEmailText}\n\n${verificationUrl}`,
      html: verificationEmailHtml({
        title: t.emailVerificationEmailTitle,
        text: t.emailVerificationEmailText,
        cta: t.goToVerification,
        url: verificationUrl
      })
    });

    return {
      success: t.registrationCreated,
      verificationUrl: emailResult.sent ? undefined : `/verify-email?token=${encodeURIComponent(token)}`
    };
  } catch (error) {
    console.error("Email verification send failed", error);
    if (user.player) {
      await prisma.player.delete({ where: { id: user.player.id } });
    }
    await prisma.user.delete({ where: { id: user.id } });
    return { error: t.registrationEmailSendFailed, values };
  }
}
