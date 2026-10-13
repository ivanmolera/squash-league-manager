"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarClock, ChartNoAxesColumnIncreasing, ClipboardCheck, Menu, Trophy } from "lucide-react";

type Item = { href: string; label: string; section: string };
type QuickItem = { href: string; label: string; icon: "results" | "rankings" | "bookings" | "tournaments" };

const icons = {
  results: ClipboardCheck,
  rankings: ChartNoAxesColumnIncreasing,
  bookings: CalendarClock,
  tournaments: Trophy
};

export function MobileNavigation({ items, quickItems, moreLabel, quickNavLabel }: { items: Item[]; quickItems: QuickItem[]; moreLabel: string; quickNavLabel: string }) {
  const pathname = usePathname();

  return (
    <>
      <details className="mobile-more">
        <summary aria-label={moreLabel} title={moreLabel}><Menu aria-hidden="true" size={20} /></summary>
        <div className="mobile-more-links">
          {items.map((item) => (
            <Link aria-current={pathname === item.href ? "page" : undefined} href={item.href} key={item.href}>{item.label}</Link>
          ))}
        </div>
      </details>
      {quickItems.length ? <div className="mobile-shortcuts" role="navigation" aria-label={quickNavLabel}>
        {quickItems.map((item) => {
          const Icon = icons[item.icon];
          const active = pathname === item.href || (item.icon === "tournaments" && pathname.startsWith("/tournaments/"));
          return (
            <Link aria-current={active ? "page" : undefined} href={item.href} key={item.icon}>
              <Icon aria-hidden="true" size={21} strokeWidth={2} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div> : null}
    </>
  );
}
