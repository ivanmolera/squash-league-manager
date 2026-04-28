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
        categories: { include: { category: true } },
        participants: {
          include: {
            competitionCategory: { include: { category: true } },
            player: true,
            club: true
          }
        }
      }
    }),
    getCurrentUser()
  ]);
  const { t } = await getDictionary();

  if (!league || !["individual_league", "team_league"].includes(league.type)) notFound();

  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));
  const participants = [...league.participants].sort((left, right) => {
    const leftCategory = left.competitionCategory.category;
    const rightCategory = right.competitionCategory.category;
    const categorySort = leftCategory.sortOrder - rightCategory.sortOrder ||
      leftCategory.name.localeCompare(rightCategory.name, "es");
    if (categorySort !== 0) return categorySort;
    const leftName = left.player ? `${left.player.lastName}, ${left.player.firstName}` : left.club?.name ?? "";
    const rightName = right.player ? `${right.player.lastName}, ${right.player.firstName}` : right.club?.name ?? "";
    return leftName.localeCompare(rightName, "es");
  });
  const participantGroups = participants.reduce<Array<{
    id: string;
    name: string;
    rows: typeof participants;
  }>>((groups, participant) => {
    const category = participant.competitionCategory.category;
    const group = groups.find((item) => item.id === participant.competitionCategoryId);
    if (group) {
      group.rows.push(participant);
    } else {
      groups.push({ id: participant.competitionCategoryId, name: category.name, rows: [participant] });
    }
    return groups;
  }, []);

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
          <p><strong>{t.description}:</strong> {league.description ?? t.notProvidedFemale}</p>
          <p><strong>{t.season}:</strong> {league.season.name}</p>
          <p><strong>{t.registration}:</strong> {league.registrationDeadline?.toLocaleDateString("es-ES") ?? t.noDeadline}</p>
          <p><strong>{t.start}:</strong> {league.startsAt?.toLocaleDateString("es-ES") ?? t.noDate}</p>
          <p><strong>{t.end}:</strong> {league.endsAt?.toLocaleDateString("es-ES") ?? t.noDate}</p>
        </article>
      </section>
      <LeagueStandings competitionId={league.id} type={league.type as "individual_league" | "team_league"} />
      <section className="list-panel full-width">
        <h2>{t.participants}</h2>
        {participantGroups.map((group) => (
          <div className="standing-block" key={group.id}>
            <h3>{group.name}</h3>
            {group.rows.map((participant) => (
              <p key={participant.id}>
                {participant.player ? (
                  <Link href={`/players/${participant.player.id}`}>{participant.player.lastName}, {participant.player.firstName}</Link>
                ) : participant.club ? (
                  <Link href={`/clubs/${participant.club.id}`}>{participant.club.name}</Link>
                ) : t.notProvided}
              </p>
            ))}
          </div>
        ))}
      </section>
    </main>
  );
}
