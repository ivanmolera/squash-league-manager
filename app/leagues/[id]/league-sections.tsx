import Link from "next/link";
import { saveMatchResultAction } from "@/app/admin/actions";
import { getCurrentUser } from "@/src/lib/auth";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";

type CurrentUser = Awaited<ReturnType<typeof getCurrentUser>>;

type IndividualStanding = {
  competition_category_id: string;
  category_name: string;
  position: number;
  player_id: string;
  player_name: string;
  matches_won: number;
  matches_lost: number;
  sets_for: number;
  sets_against: number;
  points_for: number;
  points_against: number;
};

type TeamStanding = {
  competition_category_id: string;
  category_name: string;
  position: number;
  team_id: string;
  team_name: string;
  ties_won: number;
  ties_drawn: number;
  ties_lost: number;
  rubbers_for: number;
  rubbers_against: number;
  points_for: number;
  points_against: number;
};

type MatchWithSets = Awaited<ReturnType<typeof getLeagueMatches>>[number];

async function getLeagueMatches(competitionId: string, competitionCategoryId?: string) {
  return prisma.match.findMany({
    where: { competitionId, ...(competitionCategoryId ? { competitionCategoryId } : {}) },
    include: { sets: { orderBy: { setNumber: "asc" } } },
    orderBy: [{ roundNumber: "asc" }, { matchOrder: "asc" }, { bracketPosition: "asc" }]
  });
}

async function getEditContext(currentUser: CurrentUser) {
  if (!currentUser) {
    return { isAdmin: false, playerId: null, managedClubIds: new Set<string>() };
  }

  const [player, managedClubs] = await Promise.all([
    prisma.player.findUnique({ where: { userId: currentUser.id }, select: { id: true } }),
    prisma.club.findMany({ where: { managerUserId: currentUser.id }, select: { id: true } })
  ]);

  return {
    isAdmin: currentUser.roles.some((role) => role.role === "admin"),
    playerId: player?.id ?? null,
    managedClubIds: new Set(managedClubs.map((club) => club.id))
  };
}

function canEditLeagueMatch(
  match: MatchWithSets,
  context: Awaited<ReturnType<typeof getEditContext>>
) {
  if (context.isAdmin) return true;
  if (context.playerId && (match.homePlayerId === context.playerId || match.awayPlayerId === context.playerId)) return true;
  if (match.homeClubIdAtMatchTime && context.managedClubIds.has(match.homeClubIdAtMatchTime)) return true;
  if (match.awayClubIdAtMatchTime && context.managedClubIds.has(match.awayClubIdAtMatchTime)) return true;
  return false;
}

function groupByCategory<T extends { competition_category_id: string; category_name: string }>(rows: T[]) {
  return rows.reduce<Array<{ id: string; name: string; rows: T[] }>>((groups, row) => {
    const group = groups.find((item) => item.id === row.competition_category_id);
    if (group) {
      group.rows.push(row);
    } else {
      groups.push({ id: row.competition_category_id, name: row.category_name, rows: [row] });
    }
    return groups;
  }, []);
}

function scoreText(match: MatchWithSets, pendingLabel: string) {
  if (!match.sets.length) {
    return pendingLabel;
  }

  const homeSets = match.sets.filter((set) => set.homePoints > set.awayPoints).length;
  const awaySets = match.sets.filter((set) => set.awayPoints > set.homePoints).length;
  const sets = match.sets.map((set) => `${set.homePoints}-${set.awayPoints}`).join(", ");
  return `${homeSets}-${awaySets} (${sets})`;
}

function defaultSetInput(match: MatchWithSets) {
  return match.sets.map((set) => `${set.homePoints}-${set.awayPoints}`).join(", ");
}

function dateTime(value: Date | null, locale: string, noDateLabel: string) {
  return value ? value.toLocaleString(locale, { dateStyle: "short", timeStyle: "short" }) : noDateLabel;
}

function ResultForm({ match, labels }: { match: MatchWithSets; labels: { sets: string; save: string } }) {
  return (
    <form className="result-form" action={saveMatchResultAction}>
      <input type="hidden" name="matchId" value={match.id} />
      <label>
        {labels.sets}
        <input name="setScores" defaultValue={defaultSetInput(match)} placeholder="11-8, 11-9, 11-7" />
      </label>
      <button type="submit">{labels.save}</button>
    </form>
  );
}

export async function LeagueStandings({
  competitionId,
  type
}: {
  competitionId: string;
  type: "individual_league" | "team_league";
}) {
  const { t } = await getDictionary();

  if (type === "individual_league") {
    const standings = await prisma.$queryRaw<IndividualStanding[]>`
      SELECT
        cir.competition_category_id,
        cat.name AS category_name,
        cir.position,
        cir.player_id,
        concat(p.last_name, ', ', p.first_name) AS player_name,
        cir.matches_won,
        cir.matches_lost,
        cir.sets_for,
        cir.sets_against,
        cir.points_for,
        cir.points_against
      FROM current_individual_rankings cir
      JOIN players p ON p.id = cir.player_id
      JOIN competition_categories cc ON cc.id = cir.competition_category_id
      JOIN categories cat ON cat.id = cc.category_id
      WHERE cir.competition_id = ${competitionId}::uuid
      ORDER BY cat.sort_order, cir.position, p.last_name, p.first_name
    `;

    return (
      <section className="list-panel full-width">
        <h2>{t.standingsToDate}</h2>
        {groupByCategory(standings).map((group) => (
          <div className="standing-block" key={group.id}>
            <h3>{group.name}</h3>
            <table className="data-table">
              <thead>
                <tr><th>#</th><th>{t.player}</th><th>G</th><th>P</th><th>{t.sets}</th><th>{t.points}</th></tr>
              </thead>
              <tbody>
                {group.rows.map((row) => (
                  <tr key={row.player_id}>
                    <td>{row.position}</td>
                    <td><Link href={`/players/${row.player_id}`}>{row.player_name}</Link></td>
                    <td>{row.matches_won}</td>
                    <td>{row.matches_lost}</td>
                    <td>{row.sets_for}-{row.sets_against}</td>
                    <td>{row.points_for}-{row.points_against}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Link className="secondary-link inline-link" href={`/leagues/${competitionId}/categories/${group.id}/calendar`}>
              {t.viewCategoryCalendar}
            </Link>
          </div>
        ))}
      </section>
    );
  }

  const standings = await prisma.$queryRaw<TeamStanding[]>`
    SELECT
      ctr.competition_category_id,
      cat.name AS category_name,
      ctr.position,
      ctr.team_id,
      t.name AS team_name,
      ctr.ties_won,
      ctr.ties_drawn,
      ctr.ties_lost,
      ctr.rubbers_for,
      ctr.rubbers_against,
      ctr.points_for,
      ctr.points_against
    FROM current_team_rankings ctr
    JOIN teams t ON t.id = ctr.team_id
    JOIN competition_categories cc ON cc.id = ctr.competition_category_id
    JOIN categories cat ON cat.id = cc.category_id
    WHERE ctr.competition_id = ${competitionId}::uuid
    ORDER BY cat.sort_order, ctr.position, t.name
  `;

  return (
    <section className="list-panel full-width">
      <h2>{t.standingsToDate}</h2>
      {groupByCategory(standings).map((group) => (
        <div className="standing-block" key={group.id}>
          <h3>{group.name}</h3>
          <table className="data-table">
            <thead>
              <tr><th>#</th><th>{t.team}</th><th>G</th><th>E</th><th>P</th><th>{t.players}</th><th>{t.points}</th></tr>
            </thead>
            <tbody>
              {group.rows.map((row) => (
                <tr key={row.team_id}>
                  <td>{row.position}</td>
                  <td><Link href={`/teams/${row.team_id}`}>{row.team_name}</Link></td>
                  <td>{row.ties_won}</td>
                  <td>{row.ties_drawn}</td>
                  <td>{row.ties_lost}</td>
                  <td>{row.rubbers_for}-{row.rubbers_against}</td>
                  <td>{row.points_for}-{row.points_against}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Link className="secondary-link inline-link" href={`/leagues/${competitionId}/categories/${group.id}/calendar`}>
            {t.viewCategoryCalendar}
          </Link>
        </div>
      ))}
    </section>
  );
}

export async function LeagueCategoryCalendar({
  competitionId,
  competitionCategoryId,
  type,
  currentUser
}: {
  competitionId: string;
  competitionCategoryId: string;
  type: "individual_league" | "team_league";
  currentUser: CurrentUser;
}) {
  const editContext = await getEditContext(currentUser);
  const { locale, t } = await getDictionary();
  const matches = await getLeagueMatches(competitionId, competitionCategoryId);

  if (type === "individual_league") {
    return (
      <section className="list-panel full-width">
        <h2>{t.calendar}</h2>
        <div className="calendar-list">
          {matches.map((match) => (
            <article className="match-card" key={match.id}>
              <div>
                <strong>{t.matchday} {match.roundNumber ?? "-"} · {dateTime(match.scheduledAt, locale, t.noDate)}</strong>
                <p>{match.homePlayerNameAtMatchTime} vs {match.awayPlayerNameAtMatchTime}</p>
                <p>{t.venue}: {match.homeClubNameAtMatchTime ?? t.noVenue}</p>
                <p>{t.result}: {scoreText(match, t.pending)}</p>
              </div>
              {canEditLeagueMatch(match, editContext) ? <ResultForm match={match} labels={{ sets: t.sets, save: t.saveResult }} /> : null}
            </article>
          ))}
        </div>
      </section>
    );
  }

  const teamTies = await prisma.teamTie.findMany({
    where: { competitionId, competitionCategoryId },
    orderBy: [{ scheduledAt: "asc" }, { homeTeamNameAtTime: "asc" }]
  });
  const matchesByTie = new Map<string, MatchWithSets[]>();
  for (const match of matches) {
    if (!match.teamTieId) continue;
    const tieMatches = matchesByTie.get(match.teamTieId) ?? [];
    tieMatches.push(match);
    matchesByTie.set(match.teamTieId, tieMatches);
  }

  return (
    <section className="list-panel full-width">
      <h2>{t.calendar}</h2>
      <div className="calendar-list">
        {teamTies.map((tie, index) => {
          const tieMatches = matchesByTie.get(tie.id) ?? [];
          const homeRubbers = tieMatches.filter((match) => match.winnerPlayerId === match.homePlayerId).length;
          const awayRubbers = tieMatches.filter((match) => match.winnerPlayerId === match.awayPlayerId).length;
          const completed = tieMatches.length === 4 && tieMatches.every((match) => match.status === "played");

          return (
            <article className="match-card" key={tie.id}>
              <div>
                <strong>{t.matchday} {index + 1} · {dateTime(tie.scheduledAt, locale, t.noDate)}</strong>
                <p>{tie.homeTeamNameAtTime} vs {tie.awayTeamNameAtTime}</p>
                <p>{t.venue}: {tie.homeClubNameAtTime ?? t.noVenue}</p>
                <p>{t.score}: {completed ? `${homeRubbers}-${awayRubbers}` : t.pending}</p>
              </div>
              <div className="rubber-list">
                {tieMatches.map((match) => (
                  <div className="rubber-row" key={match.id}>
                    <p>{match.matchOrder}. {match.homePlayerNameAtMatchTime} vs {match.awayPlayerNameAtMatchTime}: {scoreText(match, t.pending)}</p>
                    {canEditLeagueMatch(match, editContext) ? <ResultForm match={match} labels={{ sets: t.sets, save: t.saveResult }} /> : null}
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
