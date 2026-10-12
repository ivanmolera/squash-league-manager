import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/src/lib/prisma";

export const sessionCookieName = "slm_session";
export const playerPreviewCookieName = "slm_player_preview";

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export const getAuthenticatedUser = cache(async () => {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;

  if (!token) {
    return null;
  }

  const session = await prisma.authSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: {
      user: {
        include: {
          roles: true,
          player: {
            select: {
              id: true
            }
          }
        }
      }
    }
  });

  if (!session || session.expiresAt <= new Date() || session.user.suspendedAt) {
    return null;
  }

  return session.user;
});

export const getCurrentUser = cache(async () => {
  const user = await getAuthenticatedUser();
  if (!user) return null;
  const isAdmin = user.roles.some((role) => role.role === "admin");
  if (!isAdmin || (await cookies()).get(playerPreviewCookieName)?.value !== "1") {
    return { ...user, previewAsPlayer: false };
  }
  const playerRoles = user.roles.filter((role) => role.role === "player");
  if (user.player && !playerRoles.length) {
    playerRoles.push({ userId: user.id, role: "player", createdAt: new Date() });
  }
  return { ...user, roles: playerRoles, previewAsPlayer: true };
});

export function isManagerFor(user: Awaited<ReturnType<typeof getCurrentUser>>, managerUserId: string | null | undefined) {
  return Boolean(user && !user.previewAsPlayer && user.id === managerUserId);
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(sessionCookieName);
  cookieStore.delete(playerPreviewCookieName);
}
