import Link from "next/link";
import { MatchResultForm } from "@/app/match-result-form";
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
type TeamTie = Awaited<ReturnType<typeof getTeamTies>>[number];

async function getLeagueMatches(competitionId: string, competitionCategoryId?: string) {
  return prisma.match.findMany({
    where: { competitionId, ...(competitionCategoryId ? { competitionCategoryId } : {}) },
    include: { competition: { select: { bestOfSets: true } }, sets: { orderBy: { setNumber: "asc" } } },
    orderBy: [{ roundNumber: "asc" }, { matchOrder: "asc" }, { bracketPosition: "asc" }]
  });
}

async function getTeamTies(competitionId: string, competitionCategoryId: string) {
  return prisma.teamTie.findMany({
    where: { competitionId, competitionCategoryId },
    orderBy: [{ scheduledAt: "asc" }, { homeTeamNameAtTime: "asc" }]
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

function groupMatchesByRound(matches: MatchWithSets[]) {
  return matches.reduce<Array<{ round: number | null; matches: MatchWithSets[] }>>((groups, match) => {
    const group = groups.find((item) => item.round === match.roundNumber);
    if (group) {
      group.matches.push(match);
    } else {
      groups.push({ round: match.roundNumber, matches: [match] });
    }
    return groups;
  }, []);
}

function groupTeamTiesByDate(teamTies: TeamTie[]) {
  return teamTies.reduce<Array<{ key: string; scheduledAt: Date | null; ties: TeamTie[] }>>((groups, tie) => {
    const key = tie.scheduledAt?.toISOString().slice(0, 10) ?? "no-date";
    const group = groups.find((item) => item.key === key);
    if (group) {
      group.ties.push(tie);
    } else {
      groups.push({ key, scheduledAt: tie.scheduledAt, ties: [tie] });
    }
    return groups;
  }, []);
}

function scoreText(match: MatchWithSets, pendingLabel: string) {
  if (!match.sets.length) {
    return { main: pendingLabel, partials: "" };
  }

  const homeSets = match.sets.filter((set) => set.homePoints > set.awayPoints).length;
  const awaySets = match.sets.filter((set) => set.awayPoints > set.homePoints).length;
  const sets = match.sets.map((set) => `${set.homePoints}-${set.awayPoints}`).join(", ");
  return { main: `${homeSets}-${awaySets}`, partials: sets };
}

function dateTime(value: Date | null, locale: string, noDateLabel: string) {
  return value ? value.toLocaleString(locale, { dateStyle: "short", timeStyle: "short" }) : noDateLabel;
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
        cp.competition_category_id,
        cat.name AS category_name,
        row_number() OVER (
          PARTITION BY cp.competition_category_id
          ORDER BY COALESCE(cir.matches_won, 0) DESC,
                   CASE
                     WHEN COALESCE(cir.matches_won, 0) + COALESCE(cir.matches_lost, 0) = 0 THEN 0
                     ELSE COALESCE(cir.matches_won, 0)::numeric / (COALESCE(cir.matches_won, 0) + COALESCE(cir.matches_lost, 0))
                   END DESC,
                   (COALESCE(cir.sets_for, 0) - COALESCE(cir.sets_against, 0)) DESC,
                   (COALESCE(cir.points_for, 0) - COALESCE(cir.points_against, 0)) DESC,
                   COALESCE(cir.points_for, 0) DESC,
                   p.last_name,
                   p.first_name
        )::integer AS position,
        p.id AS player_id,
        concat(p.last_name, ', ', p.first_name) AS player_name,
        COALESCE(cir.matches_won, 0)::integer AS matches_won,
        COALESCE(cir.matches_lost, 0)::integer AS matches_lost,
        COALESCE(cir.sets_for, 0)::integer AS sets_for,
        COALESCE(cir.sets_against, 0)::integer AS sets_against,
        COALESCE(cir.points_for, 0)::integer AS points_for,
        COALESCE(cir.points_against, 0)::integer AS points_against
      FROM competition_participants cp
      JOIN players p ON p.id = cp.player_id
      JOIN competition_categories cc ON cc.id = cp.competition_category_id
      JOIN categories cat ON cat.id = cc.category_id
      LEFT JOIN current_individual_rankings cir
        ON cir.competition_id = cp.competition_id
       AND cir.competition_category_id = cp.competition_category_id
       AND cir.player_id = cp.player_id
      WHERE cp.competition_id = ${competitionId}::uuid
        AND cp.player_id IS NOT NULL
      ORDER BY cat.sort_order, position, p.last_name, p.first_name
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
            <div className="form-actions">
              <Link className="secondary-link inline-link" href={`/leagues/${competitionId}/categories/${group.id}/calendar`}>
                {t.viewCategoryCalendar}
              </Link>
              <Link className="secondary-link inline-link" href={`/leagues/${competitionId}/categories/${group.id}/evolution`}>
                {t.evolution}
              </Link>
            </div>
          </div>
        ))}
      </section>
    );
  }

  const standings = await prisma.$queryRaw<TeamStanding[]>`
    WITH category_teams AS (
      SELECT DISTINCT
        tt.competition_category_id,
        tt.home_team_id AS team_id
      FROM team_ties tt
      WHERE tt.competition_id = ${competitionId}::uuid
      UNION
      SELECT DISTINCT
        tt.competition_category_id,
        tt.away_team_id AS team_id
      FROM team_ties tt
      WHERE tt.competition_id = ${competitionId}::uuid
    )
    SELECT
      ct.competition_category_id,
      cat.name AS category_name,
      row_number() OVER (
        PARTITION BY ct.competition_category_id
        ORDER BY COALESCE(ctr.rubbers_for, 0) DESC,
                 (COALESCE(ctr.points_for, 0) - COALESCE(ctr.points_against, 0)) DESC,
                 COALESCE(ctr.points_for, 0) DESC,
                 t.name
      )::integer AS position,
      t.id AS team_id,
      t.name AS team_name,
      COALESCE(ctr.ties_won, 0)::integer AS ties_won,
      COALESCE(ctr.ties_drawn, 0)::integer AS ties_drawn,
      COALESCE(ctr.ties_lost, 0)::integer AS ties_lost,
      COALESCE(ctr.rubbers_for, 0)::integer AS rubbers_for,
      COALESCE(ctr.rubbers_against, 0)::integer AS rubbers_against,
      COALESCE(ctr.points_for, 0)::integer AS points_for,
      COALESCE(ctr.points_against, 0)::integer AS points_against
    FROM category_teams ct
    JOIN teams t ON t.id = ct.team_id
    JOIN competition_categories cc ON cc.id = ct.competition_category_id
    JOIN categories cat ON cat.id = cc.category_id
    LEFT JOIN current_team_rankings ctr
      ON ctr.competition_id = ${competitionId}::uuid
     AND ctr.competition_category_id = ct.competition_category_id
     AND ctr.team_id = ct.team_id
    ORDER BY cat.sort_order, position, t.name
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
          <div className="form-actions">
            <Link className="secondary-link inline-link" href={`/leagues/${competitionId}/categories/${group.id}/calendar`}>
              {t.viewCategoryCalendar}
            </Link>
            <Link className="secondary-link inline-link" href={`/leagues/${competitionId}/categories/${group.id}/evolution`}>
              {t.evolution}
            </Link>
          </div>
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
    const matchdayGroups = groupMatchesByRound(matches);

    return (
      <section className="list-panel full-width">
        <h2>{t.calendar}</h2>
        <div className="calendar-list">
          {matchdayGroups.map((group) => (
            <article className="matchday-card" key={group.round ?? "no-round"}>
              <header>
                <strong>{t.matchday} {group.round ?? "-"}</strong>
                <span>{dateTime(group.matches[0]?.scheduledAt ?? null, locale, t.noDate)}</span>
              </header>
              <div className="compact-match-list">
                {group.matches.map((match) => (
                  <div className="compact-match-row" key={match.id}>
                    <div>
                      <p><strong>{match.homePlayerNameAtMatchTime}</strong> vs <strong>{match.awayPlayerNameAtMatchTime}</strong></p>
                      <span>{t.venue}: {match.homeClubNameAtMatchTime ?? t.noVenue}</span>
                    </div>
                    <div className="compact-result">
                      {(() => {
                        const score = scoreText(match, t.pending);
                        return (
                          <div className="split-score">
                            <strong>{score.main}</strong>
                            {score.partials ? <span>{score.partials}</span> : null}
                          </div>
                        );
                      })()}
                      {canEditLeagueMatch(match, editContext) ? <MatchResultForm match={match} labels={{ sets: t.sets, save: t.saveResult }} /> : null}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  }

  const teamTies = await getTeamTies(competitionId, competitionCategoryId);
  const matchesByTie = new Map<string, MatchWithSets[]>();
  for (const match of matches) {
    if (!match.teamTieId) continue;
    const tieMatches = matchesByTie.get(match.teamTieId) ?? [];
    tieMatches.push(match);
    matchesByTie.set(match.teamTieId, tieMatches);
  }
  const matchdayGroups = groupTeamTiesByDate(teamTies);

  return (
    <section className="list-panel full-width">
      <h2>{t.calendar}</h2>
      <div className="calendar-list">
        {matchdayGroups.map((group, index) => (
          <article className="matchday-card" key={group.key}>
            <header>
              <strong>{t.matchday} {index + 1}</strong>
              <span>{dateTime(group.scheduledAt, locale, t.noDate)}</span>
            </header>
            <div className="compact-match-list">
              {group.ties.map((tie) => {
                const tieMatches = matchesByTie.get(tie.id) ?? [];
                const homeRubbers = tieMatches.filter((match) => match.winnerPlayerId === match.homePlayerId).length;
                const awayRubbers = tieMatches.filter((match) => match.winnerPlayerId === match.awayPlayerId).length;
                const completed = tieMatches.length === 4 && tieMatches.every((match) => match.status === "played");

                return (
                  <div className="compact-match-row team-tie-row" key={tie.id}>
                    <div>
                      <p><strong>{tie.homeTeamNameAtTime}</strong> vs <strong>{tie.awayTeamNameAtTime}</strong></p>
                      <span>{t.venue}: {tie.homeClubNameAtTime ?? t.noVenue}</span>
                    </div>
                    <div className="compact-result">
                      <span>{t.result}: {completed ? <strong>{homeRubbers}-{awayRubbers}</strong> : t.pending}</span>
                    </div>
                    <div className="rubber-list compact-rubbers">
                      {tieMatches.map((match) => (
                        <div className="rubber-row" key={match.id}>
                          {(() => {
                            const score = scoreText(match, t.pending);
                            return (
                              <p>{match.matchOrder}. {match.homePlayerNameAtMatchTime} vs {match.awayPlayerNameAtMatchTime}: <strong>{score.main}</strong>{score.partials ? ` · ${score.partials}` : ""}</p>
                            );
                          })()}
                          {canEditLeagueMatch(match, editContext) ? <MatchResultForm match={match} labels={{ sets: t.sets, save: t.saveResult }} /> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
