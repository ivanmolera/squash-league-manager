import { notFound } from "next/navigation";
import { saveTeamAction } from "@/app/admin/actions";
import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

export default async function EditTeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [team, currentUser, dictionary] = await Promise.all([
    prisma.team.findUnique({ where: { id }, include: { club: true } }),
    getCurrentUser(),
    getDictionary()
  ]);
  const { t } = dictionary;
  if (!team) notFound();
  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));
  if (!isAdmin && team.club.managerUserId !== currentUser?.id) notFound();

  return (
    <main className="app-shell">
      <Navigation />
      <form className="admin-form" action={saveTeamAction}>
        <h1>{t.editTeam}</h1>
        <input type="hidden" name="teamId" value={team.id} />
        <label>{t.name}<input name="name" defaultValue={team.name} required /></label>
        <label className="check-line"><input name="showRosterPublic" type="checkbox" defaultChecked={team.showRosterPublic} /> {t.showRosterPublic}</label>
        <button type="submit">{t.save}</button>
      </form>
    </main>
  );
}
