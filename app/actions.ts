"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { clearSessionCookie, hashSessionToken, sessionCookieName } from "@/src/lib/auth";
import { locales, type Locale } from "@/src/lib/i18n";
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

export async function setLocaleAction(formData: FormData) {
  const locale = formData.get("locale")?.toString();

  if (!locales.includes(locale as Locale)) {
    return;
  }

  const selectedLocale = locale as Locale;
  const cookieStore = await cookies();
  cookieStore.set("slm_locale", selectedLocale, {
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365
  });
}
