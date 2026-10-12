import Link from "next/link";
import { localizeCategoryName } from "@/src/lib/category-names";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";

type IndividualRow = {
  category_id: string;
  category_name: string;
  position: number;
  player_id: string;
  name: string;
  won: number;
  lost: number;
};

type TeamRow = {
  category_id: string;
  category_name: string;
  position: number;
  team_id: string;
  name: string;
  won: number;
  drawn: number;
  lost: number;
};

export async function ClubLeagueStandings({
  league
}: {
  league: { id: string; name: string; type: string };
}) {
  const { locale, t } = await getDictionary();

  if (league.type === "individual_league") {
    const rows = await prisma.$queryRaw<IndividualRow[]>`
      SELECT cc.id AS category_id, cc.display_name AS category_name,
        row_number() OVER (
          PARTITION BY cc.id
          ORDER BY COALESCE(cir.matches_won, 0) DESC,
            CASE
              WHEN COALESCE(cir.matches_won, 0) + COALESCE(cir.matches_lost, 0) = 0 THEN 0
              ELSE COALESCE(cir.matches_won, 0)::numeric / (COALESCE(cir.matches_won, 0) + COALESCE(cir.matches_lost, 0))
            END DESC,
            (COALESCE(cir.sets_for, 0) - COALESCE(cir.sets_against, 0)) DESC,
            (COALESCE(cir.points_for, 0) - COALESCE(cir.points_against, 0)) DESC,
            COALESCE(cir.points_for, 0) DESC,
            p.last_name, p.first_name
        )::integer AS position,
        p.id AS player_id,
        concat(p.last_name, ', ', p.first_name) AS name,
        COALESCE(cir.matches_won, 0)::integer AS won,
        COALESCE(cir.matches_lost, 0)::integer AS lost
      FROM competition_participants cp
      JOIN players p ON p.id = cp.player_id
      JOIN competition_categories cc ON cc.id = cp.competition_category_id
      LEFT JOIN current_individual_rankings cir
        ON cir.competition_id = cp.competition_id
       AND cir.competition_category_id = cp.competition_category_id
       AND cir.player_id = cp.player_id
      WHERE cp.competition_id = ${league.id}::uuid AND cp.player_id IS NOT NULL
      ORDER BY cc.created_at, position
    `;

    return (
      <div className="club-league-standing">
        <h3><Link href={`/leagues/${league.id}`}>{league.name}</Link></h3>
        {[...new Set(rows.map((row) => row.category_id))].map((categoryId) => {
          const group = rows.filter((row) => row.category_id === categoryId);
          return (
            <div key={categoryId}>
              <h4>{localizeCategoryName(group[0].category_name, locale)}</h4>
              <div className="standings-table-scroll">
                <table className="data-table club-standing-table">
                  <thead><tr><th>#</th><th>{t.player}</th><th>G</th><th>P</th></tr></thead>
                  <tbody>{group.map((row) => (
                    <tr key={row.player_id}>
                      <td>{row.position}</td>
                      <td><Link href={`/players/${row.player_id}`}>{row.name}</Link></td>
                      <td>{row.won}</td><td>{row.lost}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const rows = await prisma.$queryRaw<TeamRow[]>`
    WITH category_teams AS (
      SELECT DISTINCT competition_category_id AS category_id, home_team_id AS team_id
      FROM team_ties WHERE competition_id = ${league.id}::uuid
      UNION
      SELECT DISTINCT competition_category_id AS category_id, away_team_id AS team_id
      FROM team_ties WHERE competition_id = ${league.id}::uuid
    )
    SELECT cc.id AS category_id, cc.display_name AS category_name,
      row_number() OVER (
        PARTITION BY cc.id
        ORDER BY COALESCE(ctr.rubbers_for, 0) DESC,
          (COALESCE(ctr.points_for, 0) - COALESCE(ctr.points_against, 0)) DESC,
          COALESCE(ctr.points_for, 0) DESC,
          teams.name
      )::integer AS position,
      teams.id AS team_id, teams.name,
      COALESCE(ctr.ties_won, 0)::integer AS won,
      COALESCE(ctr.ties_drawn, 0)::integer AS drawn,
      COALESCE(ctr.ties_lost, 0)::integer AS lost
    FROM category_teams ct
    JOIN teams ON teams.id = ct.team_id
    JOIN competition_categories cc ON cc.id = ct.category_id
    LEFT JOIN current_team_rankings ctr
      ON ctr.competition_id = ${league.id}::uuid
     AND ctr.competition_category_id = ct.category_id
     AND ctr.team_id = ct.team_id
    ORDER BY cc.created_at, position
  `;

  return (
    <div className="club-league-standing">
      <h3><Link href={`/leagues/${league.id}`}>{league.name}</Link></h3>
      {[...new Set(rows.map((row) => row.category_id))].map((categoryId) => {
        const group = rows.filter((row) => row.category_id === categoryId);
        return (
          <div key={categoryId}>
            <h4>{localizeCategoryName(group[0].category_name, locale)}</h4>
            <div className="standings-table-scroll">
              <table className="data-table club-standing-table">
                <thead><tr><th>#</th><th>{t.team}</th><th>G</th><th>E</th><th>P</th></tr></thead>
                <tbody>{group.map((row) => (
                  <tr key={row.team_id}>
                    <td>{row.position}</td>
                    <td><Link href={`/teams/${row.team_id}`}>{row.name}</Link></td>
                    <td>{row.won}</td><td>{row.drawn}</td><td>{row.lost}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
