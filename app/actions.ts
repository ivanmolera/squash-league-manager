"use server";

import { redirect } from "next/navigation";
import { clearSessionCookie, hashSessionToken, sessionCookieName } from "@/src/lib/auth";
import { cookies } from "next/headers";
import { prisma } from "@/src/lib/prisma";

export async function logoutAction() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;

  if (token) {
    await prisma.authSession.deleteMany({
      where: {
        tokenHash: hashSessionToken(token)
      }
    });
  }

  await clearSessionCookie();
  redirect("/login");
}
