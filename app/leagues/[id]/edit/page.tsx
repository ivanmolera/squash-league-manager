import { notFound } from "next/navigation";
import { saveLeagueAction } from "@/app/admin/actions";
import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { requireFeature } from "@/src/lib/features";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";
import { LeagueParticipantFields } from "@/app/admin/leagues/league-participant-fields";
import { LeagueStandings } from "../league-sections";
import { RegenerateLeagueButton } from "./regenerate-league-button";
import { SaveConfirmation } from "./save-confirmation";

export const dynamic = "force-dynamic";

function dateInputValue(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

export default async function EditLeaguePage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ saved?: string }>;
}) {
  await requireFeature("leagues");
  const { id } = await params;
  const query = await searchParams;
  const [league, players, clubs, currentUser, dictionary] = await Promise.all([
    prisma.competition.findUnique({
      where: { id },
      include: { participants: true }
    }),
    prisma.player.findMany({
      include: {
        memberships: {
          where: { toDate: null },
          include: { club: true },
          orderBy: { fromDate: "desc" },
          take: 1
        }
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
    }),
    prisma.club.findMany({ orderBy: [{ province: "asc" }, { name: "asc" }] }),
    getCurrentUser(),
    getDictionary()
  ]);
  const { t } = dictionary;

  if (!league || !["individual_league", "team_league"].includes(league.type)) notFound();
  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));
  if (!isAdmin) notFound();

  const selectedIds = new Set(league.participants
    .map((participant) => participant.playerId ?? participant.clubId)
    .filter((participantId): participantId is string => Boolean(participantId)));
  const isIndividual = league.type === "individual_league";
  const participants = isIndividual
    ? players.map((player) => ({
        id: player.id,
        label: `${player.lastName}, ${player.firstName} · ${player.memberships[0]?.clubNameAtThatTime ?? t.independent}`,
        clubId: player.memberships[0]?.clubId ?? ""
      }))
    : clubs.map((club) => ({ id: club.id, label: `${club.province ?? t.noProvince} - ${club.name}` }));
  const weekdayOptions = [
    ["1", t.monday],
    ["2", t.tuesday],
    ["3", t.wednesday],
    ["4", t.thursday],
    ["5", t.friday],
    ["6", t.saturday],
    ["7", t.sunday]
  ];

  return (
    <main className="app-shell">
      <Navigation />
      <form className="admin-form wide-form" action={saveLeagueAction}>
        <h1>{t.editLeague}</h1>
        {query?.saved === "1" ? <SaveConfirmation message={t.savedChanges} /> : null}
        <input type="hidden" name="competitionId" value={league.id} />
        <input type="hidden" name="type" value={league.type} />
        <label>{t.name}<input name="name" defaultValue={league.name} required /></label>
        <label>{t.description}<textarea name="description" rows={3} defaultValue={league.description ?? ""} /></label>
        <label>{t.matchFormat}
          <select name="bestOfSets" defaultValue={league.bestOfSets}>
            <option value="5">{t.bestOf5}</option>
            <option value="3">{t.bestOf3}</option>
          </select>
        </label>
        <label>{t.matchFrequency}
          <select name="matchFrequency" defaultValue={league.matchFrequency}>
            <option value="weekly">{t.weekly}</option>
            <option value="biweekly">{t.biweekly}</option>
          </select>
        </label>
        <label>{t.preferredMatchDay}
          <select name="preferredMatchWeekday" defaultValue={league.preferredMatchWeekday?.toString() ?? ""}>
            <option value="">{t.distributeDuringWeek}</option>
            {weekdayOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <div className="form-row">
          <label>{t.registrationDeadline}<input name="registrationDeadline" type="date" defaultValue={dateInputValue(league.registrationDeadline)} required /></label>
          <label>{t.start}<input name="startsAt" type="date" defaultValue={dateInputValue(league.startsAt)} required /></label>
        </div>
        <LeagueParticipantFields
          clubs={clubs}
          defaultHostClubId={league.hostClubId ?? ""}
          filterByClub={isIndividual}
          labels={t}
          legend={isIndividual ? t.players : t.clubs}
          participants={participants}
          selectedIds={[...selectedIds]}
        />
        <div className="form-actions">
          <button name="mode" type="submit" value="save">{t.save}</button>
          <RegenerateLeagueButton confirmMessage={t.regenerateLeagueConfirm} label={t.regenerateMatchdays} />
        </div>
      </form>
      <LeagueStandings competitionId={league.id} type={league.type as "individual_league" | "team_league"} />
    </main>
  );
}
