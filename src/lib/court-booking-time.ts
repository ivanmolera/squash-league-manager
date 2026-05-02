export const COURT_BOOKING_TIME_ZONE = "Europe/Madrid";

type CourtBookingDateParts = {
  day: number;
  hour: number;
  minute: number;
  month: number;
  year: number;
};

function courtBookingParts(date: Date): CourtBookingDateParts {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: COURT_BOOKING_TIME_ZONE,
    year: "numeric"
  }).formatToParts(date);

  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);

  return {
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    month: value("month"),
    year: value("year")
  };
}

function timeZoneOffsetMs(date: Date) {
  const parts = courtBookingParts(date);
  const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return localAsUtc - date.getTime();
}

export function addDaysToCourtDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function courtDateKey(date: Date) {
  const parts = courtBookingParts(date);
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0")
  ].join("-");
}

export function courtLocalDateTimeToUtc(dateKey: string, hour = 0, minute = 0) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const firstPass = new Date(localAsUtc - timeZoneOffsetMs(new Date(localAsUtc)));
  return new Date(localAsUtc - timeZoneOffsetMs(firstPass));
}

export function courtWeekStart(date = new Date()) {
  const todayKey = courtDateKey(date);
  const [year, month, day] = todayKey.split("-").map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = calendarDate.getUTCDay() || 7;
  return courtLocalDateTimeToUtc(addDaysToCourtDateKey(todayKey, -dayOfWeek + 1));
}

export function courtBookingHourMinute(date: Date) {
  const parts = courtBookingParts(date);
  return { hour: parts.hour, minute: parts.minute };
}

export function formatCourtBookingDay(date: Date, locale: string) {
  const formatted = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: COURT_BOOKING_TIME_ZONE,
    weekday: "long"
  }).format(date);
  return formatted.charAt(0).toLocaleUpperCase(locale) + formatted.slice(1);
}

export function formatCourtBookingTime(date: Date) {
  return new Intl.DateTimeFormat("ca", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: COURT_BOOKING_TIME_ZONE
  }).format(date);
}
