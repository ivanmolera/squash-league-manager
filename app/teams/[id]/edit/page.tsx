import { notFound } from "next/navigation";
import { saveTeamAction } from "@/app/admin/actions";
import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

export default async function EditTeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [team, currentUser] = await Promise.all([
    prisma.team.findUnique({ where: { id }, include: { club: true } }),
    getCurrentUser()
  ]);
  if (!team) notFound();
  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));
  if (!isAdmin && team.club.managerUserId !== currentUser?.id) notFound();

  return (
    <main className="app-shell">
      <Navigation />
      <form className="admin-form" action={saveTeamAction}>
        <h1>Editar equipo</h1>
        <input type="hidden" name="teamId" value={team.id} />
        <label>Nombre<input name="name" defaultValue={team.name} required /></label>
        <label className="check-line"><input name="showRosterPublic" type="checkbox" defaultChecked={team.showRosterPublic} /> Mostrar plantilla publicamente</label>
        <button type="submit">Guardar</button>
      </form>
    </main>
  );
}
