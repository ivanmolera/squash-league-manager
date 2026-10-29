type AlertCategory = {
  id: string;
  name: string;
  genderScope: string;
  minAge: number | null;
  maxAge: number | null;
};

type AlertPlayer = {
  gender: string;
  birthDate: Date | null;
};

const levelCategories = new Set(["Primera", "Segunda", "Tercera"]);
const madridDate = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Europe/Madrid",
  year: "numeric"
});

function dateParts(date: Date) {
  const parts = madridDate.formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}

export function madridCalendarDate(date: Date) {
  const day = dateParts(date);
  return new Date(Date.UTC(day.year, day.month - 1, day.day));
}

export function daysUntilCompetition(start: Date, now: Date) {
  const startDay = dateParts(start);
  const today = dateParts(now);
  const startUtc = Date.UTC(startDay.year, startDay.month - 1, startDay.day);
  const todayUtc = Date.UTC(today.year, today.month - 1, today.day);
  return Math.round((startUtc - todayUtc) / 86_400_000);
}

export function eligibleCompetitionCategories(
  categories: AlertCategory[],
  player: AlertPlayer,
  assignedLevelCategoryId: string | null,
  referenceDate: Date
) {
  const eventDay = dateParts(referenceDate);
  const birthday = player.birthDate;
  const age = birthday ? eventDay.year - birthday.getUTCFullYear() - (
    eventDay.month < birthday.getUTCMonth() + 1 ||
    (eventDay.month === birthday.getUTCMonth() + 1 && eventDay.day < birthday.getUTCDate()) ? 1 : 0
  ) : null;

  return categories.filter((category) => {
    if (category.genderScope !== "not_specified" && category.genderScope !== player.gender) return false;
    if (category.minAge !== null && (age === null || age < category.minAge)) return false;
    if (category.maxAge !== null && (age === null || age > category.maxAge)) return false;
    if (levelCategories.has(category.name) && assignedLevelCategoryId && assignedLevelCategoryId !== category.id) return false;
    return true;
  });
}
