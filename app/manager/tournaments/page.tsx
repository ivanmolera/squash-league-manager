import Link from "next/link";
import { saveTournamentAction } from "@/app/admin/actions";
import { BackToTopButton } from "@/app/back-to-top-button";
import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

export default async function TournamentsPage() {
  const [categories, clubs, tournaments, currentUser] = await Promise.all([
    prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.club.findMany({ orderBy: [{ province: "asc" }, { name: "asc" }] }),
    prisma.competition.findMany({
      where: { type: "tournament" },
      include: { participants: true, categories: { include: { category: true } } },
      orderBy: [{ startsAt: "asc" }, { name: "asc" }]
    }),
    getCurrentUser()
  ]);
  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));
  const isManager = Boolean(currentUser?.roles.some((role) => role.role === "manager"));
  const editableClubs = isAdmin ? clubs : clubs.filter((club) => club.managerUserId === currentUser?.id);
  const canEdit = isAdmin || isManager;

  return (
    <main className="app-shell" id="page-top">
      <Navigation />
      <section className="page-heading">
        <p className="eyebrow">Manager</p>
        <h1>Torneos</h1>
        <p className="muted">Alta de torneo, categorías, inscripción de jugadores y cuadro automático.</p>
      </section>

      <section className="work-grid">
        {canEdit ? (
          <form className="admin-form wide-form" action={saveTournamentAction}>
            <h2>Nuevo torneo</h2>
            <label>Nombre<input name="name" required /></label>
            <label>Descripción<textarea name="description" rows={3} /></label>
            <label>Juez árbitro<input name="refereeName" /></label>
            <label>Formato de partido
              <select name="bestOfSets" defaultValue="5">
                <option value="5">Al mejor de 5 sets</option>
                <option value="3">Al mejor de 3 sets</option>
              </select>
            </label>
            <label>Club sede
              <select name="hostClubId" required>
                {editableClubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
              </select>
            </label>
            <div className="form-row">
              <label>Límite inscripción<input name="registrationDeadline" type="date" required /></label>
              <label>Inicio<input name="startsAt" type="date" required /></label>
            </div>
            <div className="form-row">
              <label>Fin<input name="endsAt" type="date" required /></label>
            </div>
            <fieldset className="check-grid">
              <legend>Categorías</legend>
              {categories.map((category) => (
                <label key={category.id}>
                  <input type="checkbox" name="categoryIds" value={category.id} />
                  {category.name}
                </label>
              ))}
            </fieldset>
            <p className="muted">El torneo se crea sin jugadores inscritos. Los jugadores podrán inscribirse después y el manager o admin podrá añadir inscripciones a petición.</p>
            <button type="submit" name="mode" value="save">Guardar torneo</button>
          </form>
        ) : (
          <section className="list-panel quiet-panel">
            <p className="muted">Inicia sesión como manager o admin para crear torneos.</p>
          </section>
        )}

        <section className="list-panel">
          <h2>Torneos existentes</h2>
          <div className="table-list">
            {tournaments.map((tournament) => (
              <article className="row-card" key={tournament.id}>
                <strong><Link href={`/tournaments/${tournament.id}`}>{tournament.name}</Link></strong>
                <span>{clubs.find((club) => club.id === tournament.hostClubId)?.name ?? "Sin sede"}</span>
                <span>Juez árbitro: {tournament.refereeName ?? "Sin asignar"}</span>
                <span>Mejor de {tournament.bestOfSets}</span>
                <span>Inscripción: {tournament.registrationDeadline?.toLocaleDateString("es-ES") ?? "Sin límite"}</span>
                <span>Inicio: {tournament.startsAt?.toLocaleDateString("es-ES")}</span>
                {isAdmin || editableClubs.some((club) => club.id === tournament.hostClubId) ? (
                  <Link className="secondary-link" href={`/tournaments/${tournament.id}/edit`}>Editar</Link>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      </section>
      <BackToTopButton />
    </main>
  );
}
