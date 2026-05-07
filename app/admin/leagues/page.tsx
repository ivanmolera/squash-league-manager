import Link from "next/link";
import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { requireFeature } from "@/src/lib/features";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

export default async function LeaguesPage() {
  await requireFeature("leagues");
  const [leagues, currentUser, dictionary] = await Promise.all([
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
        {isAdmin ? (
          <div className="heading-actions">
            <Link className="primary-link" href="/admin/leagues/new">{t.createNewLeague}</Link>
          </div>
        ) : null}
      </section>

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
