import { notFound } from "next/navigation";
import { saveClubAction } from "@/app/admin/actions";
import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

export default async function EditClubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [club, managers, currentUser] = await Promise.all([
    prisma.club.findUnique({ where: { id } }),
    prisma.user.findMany({ orderBy: { email: "asc" } }),
    getCurrentUser()
  ]);
  if (!club) notFound();
  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));
  if (!isAdmin && club.managerUserId !== currentUser?.id) notFound();

  return (
    <main className="app-shell">
      <Navigation />
      <form className="admin-form" action={saveClubAction}>
        <h1>Editar club</h1>
        <input type="hidden" name="clubId" value={club.id} />
        <label>Nombre<input name="name" defaultValue={club.name} required /></label>
        <label>Ciudad<input name="city" defaultValue={club.city ?? ""} /></label>
        <label>Provincia<input name="province" defaultValue={club.province ?? ""} /></label>
        <label>Dirección<input name="address" defaultValue={club.address ?? ""} /></label>
        <label>Web<input name="websiteUrl" type="url" defaultValue={club.websiteUrl ?? ""} /></label>
        <label className="check-line"><input name="showContactPublic" type="checkbox" defaultChecked={club.showContactPublic} /> Mostrar datos de contacto públicamente</label>
        <label>Manager
          <select name="managerUserId" defaultValue={club.managerUserId ?? ""} disabled={!isAdmin}>
            <option value="">Sin manager</option>
            {managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.displayName ?? manager.email}</option>)}
          </select>
        </label>
        <button type="submit">Guardar</button>
      </form>
    </main>
  );
}
