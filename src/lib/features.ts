import "server-only";

import { notFound } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/src/lib/prisma";

export const featureKeys = [
  "leagues",
  "tournaments",
  "court_bookings",
  "rankings_statistics",
  "public_registration",
  "tournament_online_registration",
  "player_result_entry",
  "club_maps",
  "player_communications",
  "teams"
] as const;

export type FeatureKey = (typeof featureKeys)[number];

export const featureDefaults = Object.fromEntries(
  featureKeys.map((key) => [key, key !== "player_communications"])
) as Record<FeatureKey, boolean>;

export const getFeatureSettings = cache(async () => {
  const settings = await prisma.appFeatureSetting.findMany();
  const merged = { ...featureDefaults };

  for (const setting of settings) {
    if (featureKeys.includes(setting.featureKey as FeatureKey)) {
      merged[setting.featureKey as FeatureKey] = setting.enabled;
    }
  }

  return merged;
});

export async function isFeatureEnabled(key: FeatureKey) {
  const settings = await getFeatureSettings();
  return settings[key];
}

export async function requireFeature(key: FeatureKey) {
  if (!(await isFeatureEnabled(key))) {
    notFound();
  }
}
