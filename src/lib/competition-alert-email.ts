import "server-only";

import { localizeCategoryName } from "@/src/lib/category-names";
import { appBaseUrl, sendTransactionalEmail } from "@/src/lib/email";
import { dictionaryForLocale } from "@/src/lib/i18n";

type CompetitionAlertEmail = {
  userId: string;
  playerId: string;
  email: string;
  locale: string;
  competition: {
    id: string;
    name: string;
    type: "tournament" | "individual_league" | "team_league";
    description: string | null;
    startsAt: Date;
    endsAt: Date | null;
    registrationDeadline: Date | null;
    hostClub: { name: string; address: string | null; city: string | null; postalCode: string | null } | null;
  };
  categoryNames: string[];
  daysUntil: number;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character] ?? character);
}

export function sendCompetitionAlertEmail(input: CompetitionAlertEmail) {
  const { locale, t } = dictionaryForLocale(input.locale);
  const competition = input.competition;
  const date = new Intl.DateTimeFormat(locale, {
    day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid"
  });
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(input.daysUntil, "day");
  const type = competition.type === "tournament" ? t.competitionAlertTournament : t.competitionAlertLeague;
  const venue = competition.hostClub
    ? [competition.hostClub.name, competition.hostClub.address,
      [competition.hostClub.postalCode, competition.hostClub.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")
    : t.venueToBeConfirmed;
  const detailsUrl = `${appBaseUrl()}${competition.type === "tournament" ? "/tournaments" : "/leagues"}/${competition.id}`;
  const preferencesUrl = `${appBaseUrl()}/players/${input.playerId}/edit`;
  const details = [
    [t.start, date.format(competition.startsAt)],
    ...(competition.endsAt && date.format(competition.endsAt) !== date.format(competition.startsAt)
      ? [[t.end, date.format(competition.endsAt)]] : []),
    [t.venue, venue],
    [t.competitionAlertEligibleCategories, input.categoryNames.map((name) => localizeCategoryName(name, locale)).join(", ")],
    ...(competition.registrationDeadline ? [[t.registrationDeadline, date.format(competition.registrationDeadline)]] : [])
  ];
  const subject = `${t.competitionAlertSubject}: ${competition.name}`;
  const introduction = `${type}: ${competition.name}. ${t.competitionAlertStarts} ${relative}.`;
  const text = [
    introduction,
    ...details.map(([label, value]) => `${label}: ${value}`),
    ...(competition.description ? [`${t.description}: ${competition.description}`] : []),
    `${t.competitionAlertMoreDetails}: ${detailsUrl}`,
    `${t.competitionAlertPreferences}: ${preferencesUrl}`
  ].join("\n\n");
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#172b29;max-width:640px">
    <h1>${escapeHtml(competition.name)}</h1>
    <p>${escapeHtml(type)} · ${escapeHtml(t.competitionAlertStarts)} ${escapeHtml(relative)}.</p>
    <dl>${details.map(([label, value]) => `<dt style="font-weight:bold">${escapeHtml(label)}</dt><dd style="margin:0 0 12px">${escapeHtml(value)}</dd>`).join("")}</dl>
    ${competition.description ? `<p>${escapeHtml(competition.description)}</p>` : ""}
    <p><a href="${escapeHtml(detailsUrl)}">${escapeHtml(t.competitionAlertMoreDetails)}</a></p>
    <p style="font-size:12px"><a href="${escapeHtml(preferencesUrl)}">${escapeHtml(t.competitionAlertPreferences)}</a></p>
  </div>`;

  return sendTransactionalEmail({
    to: input.email,
    subject,
    text,
    html,
    idempotencyKey: `competition-alert/${competition.id}/${input.userId}`
  });
}
