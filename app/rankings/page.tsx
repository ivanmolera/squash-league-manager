import Link from "next/link";
import { Navigation } from "@/app/navigation";
import { RankingCodeBadge } from "@/src/components/ranking-code-picker";
import { getDictionary } from "@/src/lib/i18n";
import { rankingOptions } from "@/src/lib/ranking-codes";
import { getTournamentRankingRows } from "@/src/lib/tournament-rankings";

export const dynamic = "force-dynamic";

export default async function RankingsPage() {
  const scoreableRankings = rankingOptions.filter((option) => option.code !== "none");
  const [{ t }, rankings] = await Promise.all([
    getDictionary(),
    Promise.all(scoreableRankings.map(async (option) => ({ ...option, rows: await getTournamentRankingRows(option.code) })))
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
        {rankingsWithResults.length ? (
          <nav className="ranking-flag-nav" aria-label={t.rankings}>
            {rankingsWithResults.map((ranking) => (
              <Link href={`#ranking-${ranking.code}`} key={ranking.code} title={ranking.name}>
                <RankingCodeBadge code={ranking.code} />
              </Link>
            ))}
          </nav>
        ) : null}
      </section>
      <section className="detail-grid">
        {rankingsWithResults.length ? rankingsWithResults.map((ranking) => (
          <article className="list-panel" id={`ranking-${ranking.code}`} key={ranking.code}>
            <h2 className="title-with-badge"><RankingCodeBadge code={ranking.code} /> {ranking.name}</h2>
            <table className="data-table">
              <thead>
                <tr><th>#</th><th>{t.player}</th><th>{t.points}</th><th>{t.tournaments}</th><th>{t.average}</th><th title={t.won} aria-label={t.won}>G</th></tr>
              </thead>
              <tbody>
                {ranking.rows.map((row, index) => (
                  <tr key={row.playerId}>
                    <td>{index + 1}</td>
                    <td><Link href={`/players/${row.playerId}`}>{row.name}</Link></td>
                    <td>{row.points}</td>
                    <td>{row.tournaments}</td>
                    <td>{row.averagePoints.toFixed(1)}</td>
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
