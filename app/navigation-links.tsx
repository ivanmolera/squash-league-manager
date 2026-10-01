"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  ChartNoAxesColumnIncreasing,
  Flag,
  House,
  ListOrdered,
  Settings2,
  Trophy,
  UserRound,
  UsersRound,
  type LucideIcon
} from "lucide-react";

type NavigationItem = {
  href: string;
  label: string;
  section: "home" | "players" | "clubs" | "leagues" | "tournaments" | "rankings" | "federations" | "profile";
};

const navigationIcons: Record<NavigationItem["section"], LucideIcon> = {
  home: House,
  profile: UserRound,
  players: UsersRound,
  clubs: Building2,
  leagues: ListOrdered,
  tournaments: Trophy,
  rankings: ChartNoAxesColumnIncreasing,
  federations: Flag
};

function isCurrentSection(pathname: string, item: NavigationItem, profileHref?: string) {
  const { section } = item;
  if (section === "home") return pathname === "/";
  if (section === "profile") return pathname === item.href || pathname.startsWith(`${item.href}/`);
  if (section === "players") return pathname.startsWith("/admin/players") || (pathname.startsWith("/players/") && !(profileHref && (pathname === profileHref || pathname.startsWith(`${profileHref}/`))));
  if (section === "clubs") return pathname.startsWith("/admin/clubs") || pathname.startsWith("/clubs/") || pathname.startsWith("/teams/");
  if (section === "leagues") return pathname.startsWith("/admin/leagues") || pathname.startsWith("/leagues/");
  if (section === "tournaments") return pathname.startsWith("/manager/tournaments") || pathname.startsWith("/tournaments/");
  if (section === "rankings") return pathname.startsWith("/rankings");
  if (section === "federations") return pathname.startsWith("/admin/federations");
  return false;
}

export function NavigationLinks({ items }: { items: NavigationItem[] }) {
  const pathname = usePathname();
  const profileHref = items.find((item) => item.section === "profile")?.href;

  return (
    <div className="nav-links">
      {items.map((item) => {
        const Icon = navigationIcons[item.section];
        return (
          <Link
            aria-current={isCurrentSection(pathname, item, profileHref) ? "page" : undefined}
            aria-label={item.label}
            href={item.href}
            key={`${item.section}-${item.href}`}
            title={item.label}
          >
            <Icon aria-hidden="true" size={20} strokeWidth={2.1} />
          </Link>
        );
      })}
    </div>
  );
}

export function NavigationSettingsLink({ label }: { label: string }) {
  const pathname = usePathname();

  return (
    <Link
      aria-current={pathname.startsWith("/admin/settings") ? "page" : undefined}
      aria-label={label}
      className="nav-settings-link"
      href="/admin/settings"
      title={label}
    >
      <Settings2 aria-hidden="true" size={18} />
    </Link>
  );
}
