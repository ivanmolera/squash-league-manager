import Link from "next/link";
import { Navigation } from "@/app/navigation";
import { getDictionary } from "@/src/lib/i18n";
import { getTournamentRankingRows, type RankingScope } from "@/src/lib/tournament-rankings";

export const dynamic = "force-dynamic";

const scopes: Array<{ id: RankingScope; labelKey: "autonomic" | "state" | "psa" }> = [
  { id: "autonomic", labelKey: "autonomic" },
  { id: "state", labelKey: "state" },
  { id: "psa", labelKey: "psa" }
];

export default async function RankingsPage() {
  const [{ t }, rankings] = await Promise.all([
    getDictionary(),
    Promise.all(scopes.map(async (scope) => ({ ...scope, rows: await getTournamentRankingRows(scope.id) })))
  ]);
  const rankingsWithResults = rankings.filter((ranking) => ranking.rows.length);

  return (
    <main className="app-shell">
      <Navigation />
      <section className="page-heading">
        <p className="eyebrow">{t.rankings}</p>
        <h1>{t.generalRankings}</h1>
        <p className="muted">{t.generalRankingsText}</p>
        <p className="muted">{t.rankingAverageText}</p>
      </section>
      <section className="detail-grid">
        {rankingsWithResults.length ? rankingsWithResults.map((ranking) => (
          <article className="list-panel" key={ranking.id}>
            <h2>{t[ranking.labelKey]}</h2>
            <table className="data-table">
              <thead>
                <tr><th>#</th><th>{t.player}</th><th>{t.average}</th><th>{t.points}</th><th>{t.tournaments}</th><th>G</th></tr>
              </thead>
              <tbody>
                {ranking.rows.map((row, index) => (
                  <tr key={row.playerId}>
                    <td>{index + 1}</td>
                    <td><Link href={`/players/${row.playerId}`}>{row.name}</Link></td>
                    <td>{row.averagePoints.toFixed(1)}</td>
                    <td>{row.points}</td>
                    <td>{row.tournaments}</td>
                    <td>{row.wins}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        )) : <p className="muted">{t.noRankingResults}</p>}
      </section>
    </main>
  );
}
