import Link from "next/link";
import { notFound } from "next/navigation";
import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";
import { LeagueStandings } from "./league-sections";

export const dynamic = "force-dynamic";

export default async function LeagueDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [league, currentUser] = await Promise.all([
    prisma.competition.findUnique({
      where: { id },
      include: {
        season: true,
        categories: { include: { category: true } }
      }
    }),
    getCurrentUser()
  ]);
  const { t } = await getDictionary();

  if (!league || !["individual_league", "team_league"].includes(league.type)) notFound();

  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));

  return (
    <main className="app-shell">
      <Navigation />
      <section className="detail-header">
        <div>
          <p className="eyebrow">{t.league}</p>
          <h1>{league.name}</h1>
        </div>
        {isAdmin ? <Link className="primary-link" href={`/leagues/${league.id}/edit`}>{t.edit}</Link> : null}
      </section>
      <section className="detail-grid">
        <article className="list-panel full-width">
          <h2>{t.leagueDetails}</h2>
          <p><strong>{t.type}:</strong> {t[league.type as keyof typeof t]}</p>
          <p><strong>{t.matchFormat}:</strong> {league.bestOfSets === 3 ? t.bestOf3 : t.bestOf5}</p>
          <p><strong>{t.description}:</strong> {league.description ?? t.notProvidedFemale}</p>
          <p><strong>{t.season}:</strong> {league.season.name}</p>
          <p><strong>{t.registration}:</strong> {league.registrationDeadline?.toLocaleDateString("es-ES") ?? t.noDeadline}</p>
          <p><strong>{t.start}:</strong> {league.startsAt?.toLocaleDateString("es-ES") ?? t.noDate}</p>
          <p><strong>{t.end}:</strong> {league.endsAt?.toLocaleDateString("es-ES") ?? t.noDate}</p>
        </article>
      </section>
      <LeagueStandings competitionId={league.id} type={league.type as "individual_league" | "team_league"} />
    </main>
  );
}
