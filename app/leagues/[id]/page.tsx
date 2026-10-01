import Link from "next/link";
import { notFound } from "next/navigation";
import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { categoryRestrictionLabel } from "@/src/lib/category-restrictions";
import { requireFeature } from "@/src/lib/features";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";
import { LeagueStandings } from "./league-sections";

export const dynamic = "force-dynamic";

export default async function LeagueDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireFeature("leagues");
  const { id } = await params;
  const [league, currentUser] = await Promise.all([
    prisma.competition.findUnique({
      where: { id },
      include: {
        season: true,
        hostClub: true,
        categories: { include: { category: true } }
      }
    }),
    getCurrentUser()
  ]);
  const { locale, t } = await getDictionary();

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
      <section className="league-overview">
        <article className="list-panel">
          <h2>{t.leagueDetails}</h2>
          {league.description ? <p className="league-description">{league.description}</p> : null}
          <dl className="league-facts">
            <div><dt>{t.type}</dt><dd>{t[league.type as keyof typeof t]}</dd></div>
            <div><dt>{t.matchFormat}</dt><dd>{league.bestOfSets === 3 ? t.bestOf3 : t.bestOf5}</dd></div>
            <div><dt>{t.season}</dt><dd>{league.season.name}</dd></div>
            {league.hostClub ? <div><dt>{t.club}</dt><dd><Link href={`/clubs/${league.hostClub.id}`}>{league.hostClub.name}</Link></dd></div> : null}
            <div><dt>{t.registration}</dt><dd>{league.registrationDeadline?.toLocaleDateString(locale) ?? t.noDeadline}</dd></div>
            <div><dt>{t.start}</dt><dd>{league.startsAt?.toLocaleDateString(locale) ?? t.noDate}</dd></div>
            <div><dt>{t.end}</dt><dd>{league.endsAt?.toLocaleDateString(locale) ?? t.noDate}</dd></div>
          </dl>
          {league.categories.length ? (
            <div className="league-restrictions">
              <strong>{t.restrictions}</strong>
              <div>
                {league.categories.map((competitionCategory) => (
                  <span className="league-restriction" key={competitionCategory.id}>
                    <b>{competitionCategory.displayName}</b>
                    {categoryRestrictionLabel(competitionCategory.category, {
                      male: t.male,
                      female: t.female,
                      other: t.other,
                      noRestrictions: t.noRestrictions
                    })}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </article>
      </section>
      <LeagueStandings competitionId={league.id} type={league.type as "individual_league" | "team_league"} />
    </main>
  );
}
