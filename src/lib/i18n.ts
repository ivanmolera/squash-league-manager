import "server-only";

import { cookies } from "next/headers";
import { getCurrentUser } from "@/src/lib/auth";

export const locales = ["ca", "es", "en"] as const;
export type Locale = (typeof locales)[number];

const dictionary = {
  ca: {
    app: "Gestor de lligues de Squash",
    publicAccess: "Consulta publica",
    adminAccess: "Acces admin",
    players: "Jugadors",
    clubs: "Clubs",
    leagues: "Lligues",
    tournaments: "Tornejos",
    dashboard: "Panell",
    language: "Idioma"
  },
  es: {
    app: "Gestor de ligas de Squash",
    publicAccess: "Consulta publica",
    adminAccess: "Acceso admin",
    players: "Jugadores",
    clubs: "Clubes",
    leagues: "Ligas",
    tournaments: "Torneos",
    dashboard: "Panel",
    language: "Idioma"
  },
  en: {
    app: "Squash League Manager",
    publicAccess: "Public access",
    adminAccess: "Admin access",
    players: "Players",
    clubs: "Clubs",
    leagues: "Leagues",
    tournaments: "Tournaments",
    dashboard: "Dashboard",
    language: "Language"
  }
} satisfies Record<Locale, Record<string, string>>;

export async function getLocale(): Promise<Locale> {
  const user = await getCurrentUser();
  const cookieStore = await cookies();
  const preferred = user?.preferredLocale ?? cookieStore.get("slm_locale")?.value ?? "es";

  return locales.includes(preferred as Locale) ? (preferred as Locale) : "es";
}

export async function getDictionary() {
  const locale = await getLocale();
  return {
    locale,
    t: dictionary[locale]
  };
}
