import Link from "next/link";
import { Navigation } from "@/app/navigation";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

type Scope = "autonomic" | "state" | "psa";

const scopes: Array<{ id: Scope; labelKey: "autonomic" | "state" | "psa" }> = [
  { id: "autonomic", labelKey: "autonomic" },
  { id: "state", labelKey: "state" },
  { id: "psa", labelKey: "psa" }
];

async function rankingRows(scope: Scope) {
  const matches = await prisma.match.findMany({
    where: {
      status: "played",
      winnerPlayerId: { not: null },
      matchType: { in: ["tournament_knockout", "tournament_round_robin", "tournament_consolation", "tournament_third_place"] },
      competition: { rankingScope: scope }
    },
    select: {
      homePlayerId: true,
      awayPlayerId: true,
      winnerPlayerId: true,
      homePlayerNameAtMatchTime: true,
      awayPlayerNameAtMatchTime: true
    }
  });
  const scores = new Map<string, { playerId: string; name: string; points: number; played: number; won: number; lost: number }>();
  const ensure = (playerId: string, name: string | null) => {
    const existing = scores.get(playerId) ?? { playerId, name: name ?? "Jugador", points: 0, played: 0, won: 0, lost: 0 };
    scores.set(playerId, existing);
    return existing;
  };

  for (const match of matches) {
    for (const side of [
      { playerId: match.homePlayerId, name: match.homePlayerNameAtMatchTime },
      { playerId: match.awayPlayerId, name: match.awayPlayerNameAtMatchTime }
    ]) {
      if (!side.playerId) continue;
      const score = ensure(side.playerId, side.name);
      score.played += 1;
      score.points += 2;
      if (match.winnerPlayerId === side.playerId) {
        score.won += 1;
        score.points += 10;
      } else {
        score.lost += 1;
      }
    }
  }

  return [...scores.values()].sort((left, right) =>
    right.points - left.points ||
    right.won - left.won ||
    right.played - left.played ||
    left.name.localeCompare(right.name)
  );
}

export default async function RankingsPage() {
  const [{ t }, rankings] = await Promise.all([
    getDictionary(),
    Promise.all(scopes.map(async (scope) => ({ ...scope, rows: await rankingRows(scope.id) })))
  ]);

  return (
    <main className="app-shell">
      <Navigation />
      <section className="page-heading">
        <p className="eyebrow">{t.rankings}</p>
        <h1>{t.generalRankings}</h1>
        <p className="muted">{t.generalRankingsText}</p>
      </section>
      <section className="detail-grid">
        {rankings.map((ranking) => (
          <article className="list-panel" key={ranking.id}>
            <h2>{t[ranking.labelKey]}</h2>
            {ranking.rows.length ? (
              <table className="data-table">
                <thead>
                  <tr><th>#</th><th>{t.player}</th><th>{t.points}</th><th>G</th><th>P</th></tr>
                </thead>
                <tbody>
                  {ranking.rows.map((row, index) => (
                    <tr key={row.playerId}>
                      <td>{index + 1}</td>
                      <td><Link href={`/players/${row.playerId}`}>{row.name}</Link></td>
                      <td>{row.points}</td>
                      <td>{row.won}</td>
                      <td>{row.lost}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="muted">{t.noRankingResults}</p>}
          </article>
        ))}
      </section>
    </main>
  );
}
