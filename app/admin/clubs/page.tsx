import Link from "next/link";
import { saveClubAction } from "@/app/admin/actions";
import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ClubsPage() {
  const [clubs, managers, currentUser] = await Promise.all([
    prisma.club.findMany({ include: { manager: true }, orderBy: [{ province: "asc" }, { name: "asc" }] }),
    prisma.user.findMany({ orderBy: { email: "asc" } }),
    getCurrentUser()
  ]);
  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));

  return (
    <main className="app-shell">
      <Navigation />
      <section className="page-heading">
        <p className="eyebrow">Admin</p>
        <h1>Clubes</h1>
        {!isAdmin ? <p className="muted">Inicia sesión para modificar los datos del club.</p> : null}
      </section>
      <section className="list-panel full-width">
        <h2>Listado de clubes</h2>
        {clubs.map((club) => {
          const address = `${club.address ?? "Sin dirección"}, ${club.city ?? "Sin ciudad"} (${club.province ?? "Sin provincia"})`;

          return isAdmin || club.managerUserId === currentUser?.id ? (
            <article className="row-card" key={club.id}>
              <strong><Link href={`/clubs/${club.id}`}>{club.name}</Link></strong>
              <span>{address}</span>
              <Link className="secondary-link" href={`/clubs/${club.id}/edit`}>Editar</Link>
            </article>
          ) : (
            <article className="row-card" key={club.id}>
              <strong><Link href={`/clubs/${club.id}`}>{club.name}</Link></strong>
              <span>{address}</span>
            </article>
          );
        })}
      </section>
      {isAdmin ? (
        <section className="work-grid">
          <form className="admin-form" action={saveClubAction}>
            <h2>Nuevo club</h2>
            <ClubFields managers={managers} isAdmin={isAdmin} />
            <button type="submit">Crear club</button>
          </form>
        </section>
      ) : null}
    </main>
  );
}

function ClubFields({
  club,
  managers,
  isAdmin
}: {
  club?: { name?: string; city?: string | null; province?: string | null; address?: string | null; websiteUrl?: string | null; managerUserId?: string | null; showContactPublic?: boolean };
  managers: Array<{ id: string; email: string; displayName: string | null }>;
  isAdmin: boolean;
}) {
  return (
    <>
      <label>Nombre<input name="name" defaultValue={club?.name ?? ""} required /></label>
      <div className="form-row">
        <label>Ciudad<input name="city" defaultValue={club?.city ?? ""} /></label>
        <label>Provincia<input name="province" defaultValue={club?.province ?? ""} /></label>
      </div>
      <div className="form-row">
        <label>Web<input name="websiteUrl" type="url" defaultValue={club?.websiteUrl ?? ""} /></label>
        <label>Dirección<input name="address" defaultValue={club?.address ?? ""} /></label>
      </div>
      <label>Manager
        <select name="managerUserId" defaultValue={club?.managerUserId ?? ""} disabled={!isAdmin}>
          <option value="">Sin manager</option>
          {managers.map((manager) => (
            <option key={manager.id} value={manager.id}>
              {manager.displayName ?? manager.email}
            </option>
          ))}
        </select>
      </label>
      <label className="check-line">
        <input name="showContactPublic" type="checkbox" defaultChecked={club?.showContactPublic ?? true} />
        Mostrar datos de contacto públicamente
      </label>
    </>
  );
}
