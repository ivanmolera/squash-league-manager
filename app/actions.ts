"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { clearSessionCookie, getAuthenticatedUser, hashSessionToken, playerPreviewCookieName, sessionCookieName } from "@/src/lib/auth";
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

export async function setPlayerPreviewAction(formData: FormData) {
  const user = await getAuthenticatedUser();
  if (!user?.roles.some((role) => role.role === "admin")) return;

  const preview = formData.get("preview")?.toString() === "1";
  const cookieStore = await cookies();
  if (preview) {
    cookieStore.set(playerPreviewCookieName, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/"
    });
  } else {
    cookieStore.delete(playerPreviewCookieName);
  }

  const requestedPath = formData.get("returnTo")?.toString() ?? "/";
  const safePath = requestedPath.startsWith("/") && !requestedPath.startsWith("//") ? requestedPath : "/";
  redirect(preview ? "/" : safePath);
}

export async function setViewModeAction(formData: FormData) {
  const mode = formData.get("mode")?.toString();
  if (mode !== "mobile" && mode !== "desktop") return;

  const requestedPath = formData.get("returnTo")?.toString() ?? "/";
  const safePath = requestedPath.startsWith("/") && !requestedPath.startsWith("//") && !requestedPath.startsWith("/view/mobile")
    ? requestedPath
    : "/";
  const cookieStore = await cookies();
  if (mode === "desktop") {
    cookieStore.set("slm_desktop_view", "1", { sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
    redirect(safePath);
  }

  cookieStore.delete("slm_desktop_view");
  if (formData.get("preview")?.toString() === "1") {
    redirect(`/view/mobile?path=${encodeURIComponent(safePath)}`);
  }
  redirect(safePath);
}
