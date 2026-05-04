import Link from "next/link";
import { saveLeagueAction } from "@/app/admin/actions";
import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { requireFeature } from "@/src/lib/features";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";
import { LeagueParticipantFields } from "./league-participant-fields";

export const dynamic = "force-dynamic";

export default async function LeaguesPage() {
  await requireFeature("leagues");
  const [players, clubs, leagues, currentUser, dictionary] = await Promise.all([
    prisma.player.findMany({
      include: {
        user: true,
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
    prisma.competition.findMany({
      where: { type: { in: ["individual_league", "team_league"] } },
      include: { participants: true },
      orderBy: [{ startsAt: "desc" }, { name: "asc" }]
    }),
    getCurrentUser(),
    getDictionary()
  ]);
  const { locale, t } = dictionary;
  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));
  const now = new Date();
  const activeLeagues = leagues.filter((league) => !league.endsAt || league.endsAt >= now);
  const completedLeagues = leagues.filter((league) => league.endsAt && league.endsAt < now);

  return (
    <main className="app-shell">
      <Navigation />
      <section className="page-heading">
        <p className="eyebrow">{t.admin}</p>
        <h1>{t.leagues}</h1>
        <p className="muted">{t.loginAsAdminToEditLeagues}</p>
      </section>

      {isAdmin ? (
        <section className="work-grid">
          <LeagueForm title={t.individualLeagueTitle} type="individual_league" clubs={clubs} labels={t} participants={players.map((player) => ({
            id: player.id,
            label: `${player.lastName}, ${player.firstName} · ${player.memberships[0]?.clubNameAtThatTime ?? t.independent}`,
            clubId: player.memberships[0]?.clubId ?? ""
          }))} />
          <LeagueForm title={t.teamLeagueTitle} type="team_league" clubs={clubs} labels={t} participants={clubs.map((club) => ({
            id: club.id,
            label: `${club.province ?? t.noProvince} - ${club.name}`
          }))} />
        </section>
      ) : null}

      <LeagueList title={t.activeLeagues} leagues={activeLeagues} isAdmin={isAdmin} completed={false} labels={t} locale={locale} />
      <LeagueList title={t.completedLeagues} leagues={completedLeagues} isAdmin={isAdmin} completed labels={t} locale={locale} />
    </main>
  );
}

function LeagueList({
  title,
  leagues,
  isAdmin,
  labels,
  locale,
  completed = false
}: {
  title: string;
  leagues: Awaited<ReturnType<typeof prisma.competition.findMany>>;
  isAdmin: boolean;
  labels: Record<string, string>;
  locale: string;
  completed?: boolean;
}) {
  return (
    <section className="list-panel full-width">
      <h2>{title}</h2>
      <div className="table-list">
        {leagues.length ? leagues.map((league) => (
          <article className={`league-row${completed ? " is-ended" : ""}`} key={league.id}>
            <div>
              <strong><Link href={`/leagues/${league.id}`}>{league.name}</Link></strong>
              <span>{league.type === "individual_league" ? labels.individual_league : labels.team_league}</span>
            </div>
            <p className="date-row">
              <span>{labels.registration}: {league.registrationDeadline?.toLocaleDateString(locale) ?? labels.noDeadline}</span>
              <span>{labels.start}: {league.startsAt?.toLocaleDateString(locale)}</span>
              <span>{labels.end}: {league.endsAt?.toLocaleDateString(locale)}</span>
            </p>
            {isAdmin ? <Link className="secondary-link" href={`/leagues/${league.id}/edit`}>{labels.edit}</Link> : null}
          </article>
        )) : <p className="muted">{labels.noLeagues}</p>}
      </div>
    </section>
  );
}

function LeagueForm({
  title,
  type,
  clubs,
  labels,
  participants
}: {
  title: string;
  type: "individual_league" | "team_league";
  clubs: Array<{ id: string; name: string }>;
  labels: Record<string, string>;
  participants: Array<{ id: string; label: string; clubId?: string }>;
}) {
  const weekdayOptions = [
    ["1", labels.monday],
    ["2", labels.tuesday],
    ["3", labels.wednesday],
    ["4", labels.thursday],
    ["5", labels.friday],
    ["6", labels.saturday],
    ["7", labels.sunday]
  ];

  return (
    <form className="admin-form" action={saveLeagueAction}>
      <h2>{title}</h2>
      <input type="hidden" name="type" value={type} />
      <label>{labels.name}<input name="name" required /></label>
      <label>{labels.description}<textarea name="description" rows={3} /></label>
      <label>{labels.matchFormat}
        <select name="bestOfSets" defaultValue="5">
          <option value="5">{labels.bestOf5}</option>
          <option value="3">{labels.bestOf3}</option>
        </select>
      </label>
      <label>{labels.matchFrequency}
        <select name="matchFrequency" defaultValue="biweekly">
          <option value="weekly">{labels.weekly}</option>
          <option value="biweekly">{labels.biweekly}</option>
        </select>
      </label>
      <label>{labels.preferredMatchDay}
        <select name="preferredMatchWeekday" defaultValue="">
          <option value="">{labels.distributeDuringWeek}</option>
          {weekdayOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <div className="form-row">
        <label>{labels.registrationDeadline}<input name="registrationDeadline" type="date" required /></label>
        <label>{labels.start}<input name="startsAt" type="date" required /></label>
      </div>
      <LeagueParticipantFields
        clubs={clubs}
        filterByClub={type === "individual_league"}
        labels={labels}
        legend={type === "individual_league" ? labels.players : labels.clubs}
        participants={participants}
      />
      <button type="submit">{labels.createAndGenerateMatchdays}</button>
    </form>
  );
}
