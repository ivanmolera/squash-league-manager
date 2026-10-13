type MatchdayDates = { startsAt: Date; endsAt: Date } | null;

type MatchSchedule = {
  scheduledAt: Date | null;
  leagueMatchday: MatchdayDates;
};

export function isUpcomingScheduledMatch(match: MatchSchedule, now = new Date()) {
  if (match.scheduledAt) return match.scheduledAt >= now;
  if (!match.leagueMatchday) return true;
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const today = `${value("year")}-${value("month")}-${value("day")}`;
  return match.leagueMatchday.endsAt.toISOString().slice(0, 10) >= today;
}

export function formatMatchSchedule(match: MatchSchedule, locale: string, pendingLabel: string) {
  if (match.scheduledAt) {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Europe/Madrid"
    }).format(match.scheduledAt);
  }
  if (!match.leagueMatchday) return pendingLabel;

  const formatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" });
  const { startsAt, endsAt } = match.leagueMatchday;
  return startsAt.getTime() === endsAt.getTime()
    ? formatter.format(startsAt)
    : `${formatter.format(startsAt)} - ${formatter.format(endsAt)}`;
}

export function formatMatchScore(match: {
  status: "played" | "walkover" | "retired";
  sets: Array<{ homePoints: number; awayPoints: number }>;
}) {
  if (match.status === "walkover") return "W.O.";
  if (!match.sets.length) return match.status === "retired" ? "RET" : "-";
  const homeSets = match.sets.filter((set) => set.homePoints > set.awayPoints).length;
  const awaySets = match.sets.filter((set) => set.awayPoints > set.homePoints).length;
  return `${homeSets}-${awaySets} (${match.sets.map((set) => `${set.homePoints}-${set.awayPoints}`).join(", ")})`;
}
