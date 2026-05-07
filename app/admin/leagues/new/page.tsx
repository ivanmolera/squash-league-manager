import Link from "next/link";
import { redirect } from "next/navigation";
import { LeagueForm } from "@/app/admin/leagues/league-form";
import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { requireFeature } from "@/src/lib/features";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

export default async function NewLeaguePage() {
  await requireFeature("leagues");
  const [players, clubs, currentUser, dictionary] = await Promise.all([
    prisma.player.findMany({
      where: { mergedIntoPlayerId: null },
      include: {
        user: true,
        memberships: {
          where: { toDate: null },
          include: { club: true },
          orderBy: { fromDate: "desc" },
          take: 1
        }
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
    }),
    prisma.club.findMany({ orderBy: [{ province: "asc" }, { name: "asc" }] }),
    getCurrentUser(),
    getDictionary()
  ]);
  const { t } = dictionary;
  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));

  if (!currentUser) redirect("/login");
  if (!isAdmin) redirect("/admin/leagues");

  return (
    <main className="app-shell">
      <Navigation />
      <section className="page-heading">
        <p className="eyebrow">{t.admin}</p>
        <h1>{t.createNewLeague}</h1>
        <Link className="secondary-link" href="/admin/leagues">{t.leagues}</Link>
      </section>
      <section className="work-grid">
        <LeagueForm
          title={t.individualLeagueTitle}
          type="individual_league"
          clubs={clubs}
          labels={t}
          returnTo="/admin/leagues"
          participants={players.map((player) => ({
            id: player.id,
            label: `${player.lastName}, ${player.firstName} · ${player.memberships[0]?.clubNameAtThatTime ?? t.independent}`,
            clubId: player.memberships[0]?.clubId ?? ""
          }))}
        />
        <LeagueForm
          title={t.teamLeagueTitle}
          type="team_league"
          clubs={clubs}
          labels={t}
          returnTo="/admin/leagues"
          participants={clubs.map((club) => ({
            id: club.id,
            label: `${club.province ?? t.noProvince} - ${club.name}`
          }))}
        />
      </section>
    </main>
  );
}
