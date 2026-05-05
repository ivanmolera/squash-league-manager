import Link from "next/link";
import { Navigation } from "@/app/navigation";
import { RankingCodeBadge } from "@/src/components/ranking-code-picker";
import { requireFeature } from "@/src/lib/features";
import { getDictionary } from "@/src/lib/i18n";
import { rankingOptions } from "@/src/lib/ranking-codes";
import { getTournamentRankingCategoryGroups } from "@/src/lib/tournament-rankings";

export const dynamic = "force-dynamic";

export default async function RankingsPage({
  searchParams
}: {
  searchParams?: Promise<{ ranking?: string }>;
}) {
  await requireFeature("rankings_statistics");
  const scoreableRankings = rankingOptions.filter((option) => option.code !== "none");
  const searchParamsPromise: Promise<{ ranking?: string }> = searchParams ?? Promise.resolve({});
  const [{ t }, rankings, resolvedSearchParams] = await Promise.all([
    getDictionary(),
    Promise.all(scoreableRankings.map(async (option) => ({ ...option, groups: await getTournamentRankingCategoryGroups(option.code) }))),
    searchParamsPromise
  ]);
  const rankingsWithResults = rankings.filter((ranking) => ranking.groups.length);
  const requestedRanking = resolvedSearchParams.ranking?.toUpperCase();
  const selectedRanking =
    rankingsWithResults.find((ranking) => ranking.code === requestedRanking) ??
    rankingsWithResults[0] ??
    null;

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
              <Link
                aria-current={selectedRanking?.code === ranking.code ? "page" : undefined}
                href={`/rankings?ranking=${ranking.code}`}
                key={ranking.code}
                title={ranking.name}
              >
                <RankingCodeBadge code={ranking.code} />
              </Link>
            ))}
          </nav>
        ) : null}
      </section>
      <section className="detail-grid rankings-detail-grid">
        {selectedRanking ? (
          <article className="list-panel ranking-table-panel" id={`ranking-${selectedRanking.code}`}>
            <h2 className="title-with-badge"><RankingCodeBadge code={selectedRanking.code} /> {selectedRanking.name}</h2>
            <div className="ranking-category-list">
              {selectedRanking.groups.map((group) => (
                <section className="ranking-category-section" key={group.categoryId}>
                  <h3>{group.categoryName}</h3>
                  <table className="data-table">
                    <thead>
                      <tr><th>#</th><th>{t.player}</th><th>{t.points}</th><th>{t.tournaments}</th><th>{t.average}</th><th title={t.won} aria-label={t.won}>G</th></tr>
                    </thead>
                    <tbody>
                      {group.rows.map((row, index) => (
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
                </section>
              ))}
            </div>
          </article>
        ) : <p className="muted">{t.noRankingResults}</p>}
      </section>
    </main>
  );
}
