"use server";

import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { hashSessionToken } from "@/src/lib/auth";
import { appBaseUrl, sendTransactionalEmail } from "@/src/lib/email";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";

const emailSchema = z.object({
  email: z.string().trim().email()
});

const resetPasswordSchema = z.object({
  token: z.string().min(20),
  newPassword: z.string().min(8),
  confirmPassword: z.string().min(8)
}).refine((value) => value.newPassword === value.confirmPassword, {
  path: ["confirmPassword"]
});

export type AccountActionState = {
  error?: string;
  success?: string;
};

function createAccountToken() {
  return randomBytes(32).toString("base64url");
}

function accountEmailHtml({ title, text, cta, url }: { title: string; text: string; cta: string; url: string }) {
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

export async function resendVerificationEmailAction(_state: AccountActionState, formData: FormData): Promise<AccountActionState> {
  const { t } = await getDictionary();
  const parsed = emailSchema.safeParse({ email: formData.get("email") });

  if (!parsed.success) {
    return { error: t.invalidEmailPassword };
  }

  const email = parsed.data.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || user.emailVerified || user.suspendedAt) {
    return { success: t.resendVerificationSent };
  }

  const token = createAccountToken();
  const verificationUrl = `${appBaseUrl()}/verify-email?token=${encodeURIComponent(token)}`;

  await prisma.emailVerificationToken.create({
    data: {
      userId: user.id,
      tokenHash: hashSessionToken(token),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24)
    }
  });

  try {
    await sendTransactionalEmail({
      to: email,
      subject: t.emailVerificationSubject,
      text: `${t.emailVerificationEmailText}\n\n${verificationUrl}`,
      html: accountEmailHtml({
        title: t.emailVerificationEmailTitle,
        text: t.emailVerificationEmailText,
        cta: t.goToVerification,
        url: verificationUrl
      })
    });
  } catch (error) {
    console.error("Verification resend failed", error);
    return { error: t.registrationEmailSendFailed };
  }

  return { success: t.resendVerificationSent };
}

export async function requestPasswordResetAction(_state: AccountActionState, formData: FormData): Promise<AccountActionState> {
  const { t } = await getDictionary();
  const parsed = emailSchema.safeParse({ email: formData.get("email") });

  if (!parsed.success) {
    return { error: t.invalidEmailPassword };
  }

  const email = parsed.data.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.emailVerified || user.suspendedAt) {
    return { success: t.resetPasswordSent };
  }

  const token = createAccountToken();
  const resetUrl = `${appBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashSessionToken(token),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60)
    }
  });

  try {
    await sendTransactionalEmail({
      to: email,
      subject: t.resetPasswordSubject,
      text: `${t.resetPasswordEmailText}\n\n${resetUrl}`,
      html: accountEmailHtml({
        title: t.resetPasswordEmailTitle,
        text: t.resetPasswordEmailText,
        cta: t.resetPassword,
        url: resetUrl
      })
    });
  } catch (error) {
    console.error("Password reset email failed", error);
    return { error: t.registrationEmailSendFailed };
  }

  return { success: t.resetPasswordSent };
}

export async function resetPasswordAction(_state: AccountActionState, formData: FormData): Promise<AccountActionState> {
  const { t } = await getDictionary();
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword")
  });

  if (!parsed.success) {
    return { error: t.registrationInvalid };
  }

  const tokenHash = hashSessionToken(parsed.data.token);
  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true }
  });

  if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= new Date() || resetToken.user.suspendedAt) {
    return { error: t.resetPasswordInvalidText };
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);

  await prisma.$transaction([
    prisma.authCredential.upsert({
      where: { userId: resetToken.userId },
      update: {
        passwordHash,
        passwordChangedAt: new Date()
      },
      create: {
        userId: resetToken.userId,
        passwordHash
      }
    }),
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() }
    }),
    prisma.authSession.deleteMany({ where: { userId: resetToken.userId } })
  ]);

  return { success: t.passwordResetDone };
}
