import Link from "next/link";
import { notFound } from "next/navigation";
import { Navigation } from "@/app/navigation";
import { LeagueEvolutionChart } from "@/app/leagues/[id]/league-evolution";
import { requireFeature } from "@/src/lib/features";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

export default async function LeagueCategoryEvolutionPage({
  params
}: {
  params: Promise<{ id: string; categoryId: string }>;
}) {
  await requireFeature("leagues");
  const { id, categoryId } = await params;
  const [competitionCategory, { t }] = await Promise.all([
    prisma.competitionCategory.findFirst({
      where: { id: categoryId, competitionId: id },
      include: { competition: true }
    }),
    getDictionary()
  ]);

  if (!competitionCategory || !["individual_league", "team_league"].includes(competitionCategory.competition.type)) {
    notFound();
  }

  return (
    <main className="app-shell">
      <Navigation />
      <section className="detail-header">
        <div>
          <p className="eyebrow">{t.evolution}</p>
          <h1>{competitionCategory.displayName}</h1>
          <p className="muted">{competitionCategory.competition.name}</p>
        </div>
        <Link className="primary-link" href={`/leagues/${id}`}>{t.backToLeague}</Link>
      </section>
      <section className="list-panel full-width">
        <LeagueEvolutionChart
          competitionId={id}
          competitionCategoryId={categoryId}
          type={competitionCategory.competition.type as "individual_league" | "team_league"}
          showEmptyMessage
        />
      </section>
    </main>
  );
}
