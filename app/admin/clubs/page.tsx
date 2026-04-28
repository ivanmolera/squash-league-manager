import { saveClubAction } from "@/app/admin/actions";
import { Navigation } from "@/app/navigation";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ClubsPage() {
  const [clubs, managers] = await Promise.all([
    prisma.club.findMany({ include: { manager: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ orderBy: { email: "asc" } })
  ]);

  return (
    <main className="app-shell">
      <Navigation />
      <section className="page-heading">
        <p className="eyebrow">Admin</p>
        <h1>Clubes</h1>
        <p className="muted">Alta y modificacion de clubes, con manager unico por club.</p>
      </section>
      <section className="work-grid">
        <form className="admin-form" action={saveClubAction}>
          <h2>Nuevo club</h2>
          <ClubFields managers={managers} />
          <button type="submit">Crear club</button>
        </form>
        <div className="list-panel">
          <h2>Clubes existentes</h2>
          {clubs.map((club) => (
            <form className="compact-form" action={saveClubAction} key={club.id}>
              <input type="hidden" name="clubId" value={club.id} />
              <ClubFields club={club} managers={managers} />
              <button type="submit">Guardar cambios</button>
            </form>
          ))}
        </div>
      </section>
    </main>
  );
}

function ClubFields({
  club,
  managers
}: {
  club?: { name?: string; city?: string | null; address?: string | null; websiteUrl?: string | null; managerUserId?: string | null };
  managers: Array<{ id: string; email: string; displayName: string | null }>;
}) {
  return (
    <>
      <label>Nombre<input name="name" defaultValue={club?.name ?? ""} required /></label>
      <div className="form-row">
        <label>Ciudad<input name="city" defaultValue={club?.city ?? ""} /></label>
        <label>Web<input name="websiteUrl" type="url" defaultValue={club?.websiteUrl ?? ""} /></label>
      </div>
      <label>Direccion<input name="address" defaultValue={club?.address ?? ""} /></label>
      <label>Manager
        <select name="managerUserId" defaultValue={club?.managerUserId ?? ""}>
          <option value="">Sin manager</option>
          {managers.map((manager) => (
            <option key={manager.id} value={manager.id}>
              {manager.displayName ?? manager.email}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
