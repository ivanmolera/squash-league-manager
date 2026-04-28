import { notFound } from "next/navigation";
import { removePlayerFromClubAction, saveClubAction } from "@/app/admin/actions";
import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

export default async function EditClubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [club, currentUser] = await Promise.all([
    prisma.club.findUnique({
      where: { id },
      include: {
        memberships: {
          where: { toDate: null },
          include: { player: { include: { user: true } } },
          orderBy: [{ player: { lastName: "asc" } }, { player: { firstName: "asc" } }]
        }
      }
    }),
    getCurrentUser()
  ]);
  if (!club) notFound();
  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));
  if (!isAdmin && club.managerUserId !== currentUser?.id) notFound();
  const managers = club.memberships
    .map((membership) => membership.player.user)
    .filter(Boolean)
    .filter((user, index, users) => users.findIndex((item) => item?.id === user?.id) === index);

  return (
    <main className="app-shell">
      <Navigation />
      <section className="work-grid">
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
              {managers.map((manager) => (
                manager ? <option key={manager.id} value={manager.id}>{manager.displayName ?? manager.email}</option> : null
              ))}
            </select>
          </label>
          <button type="submit">Guardar</button>
        </form>
        <section className="list-panel">
          <h2>Jugadores del club</h2>
          {club.memberships.map((membership) => (
            <article className="row-card" key={membership.id}>
              <strong>{membership.player.lastName}, {membership.player.firstName}</strong>
              <span>{membership.player.user?.email ?? "Sin usuario"}</span>
              <form action={removePlayerFromClubAction}>
                <input type="hidden" name="membershipId" value={membership.id} />
                <input type="hidden" name="clubId" value={club.id} />
                <button className="danger-button" type="submit">Dar de baja</button>
              </form>
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}
