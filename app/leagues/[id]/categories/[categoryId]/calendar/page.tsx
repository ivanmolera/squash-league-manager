import Link from "next/link";
import { notFound } from "next/navigation";
import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";
import { LeagueCategoryCalendar } from "../../../league-sections";

export const dynamic = "force-dynamic";

export default async function LeagueCategoryCalendarPage({
  params
}: {
  params: Promise<{ id: string; categoryId: string }>;
}) {
  const { id, categoryId } = await params;
  const [competitionCategory, currentUser] = await Promise.all([
    prisma.competitionCategory.findFirst({
      where: { id: categoryId, competitionId: id },
      include: { category: true, competition: true }
    }),
    getCurrentUser()
  ]);
  const { t } = await getDictionary();

  if (!competitionCategory || !["individual_league", "team_league"].includes(competitionCategory.competition.type)) {
    notFound();
  }

  return (
    <main className="app-shell">
      <Navigation />
      <section className="detail-header">
        <div>
          <p className="eyebrow">{t.calendar}</p>
          <h1>{competitionCategory.displayName}</h1>
          <p className="muted">{competitionCategory.competition.name}</p>
        </div>
        <Link className="primary-link" href={`/leagues/${competitionCategory.competition.id}`}>{t.backToLeague}</Link>
      </section>
      <LeagueCategoryCalendar
        competitionId={competitionCategory.competition.id}
        competitionCategoryId={competitionCategory.id}
        type={competitionCategory.competition.type as "individual_league" | "team_league"}
        currentUser={currentUser}
      />
    </main>
  );
}
