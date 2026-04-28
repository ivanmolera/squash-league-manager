import Link from "next/link";
import { saveTournamentAction } from "@/app/admin/actions";
import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

export default async function TournamentsPage() {
  const [players, clubs, tournaments, currentUser] = await Promise.all([
    prisma.player.findMany({ orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
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
    <main className="app-shell">
      <Navigation />
      <section className="page-heading">
        <p className="eyebrow">Manager</p>
        <h1>Torneos</h1>
        <p className="muted">Alta de torneo, inscripciones, cabezas de serie y cuadro automatico.</p>
      </section>

      <section className="work-grid">
        {canEdit ? (
          <form className="admin-form wide-form" action={saveTournamentAction}>
            <h2>Nuevo torneo</h2>
            <label>Nombre<input name="name" required /></label>
            <label>Descripción<textarea name="description" rows={3} /></label>
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
              <legend>Jugadores inscritos</legend>
              {players.map((player) => (
                <label key={player.id}>
                  <input type="checkbox" name="participantIds" value={player.id} />
                  {player.lastName}, {player.firstName}
                </label>
              ))}
            </fieldset>
            <fieldset className="check-grid">
              <legend>Cabezas de serie manuales</legend>
              {players.map((player) => (
                <label key={player.id}>
                  <input type="checkbox" name="seedPlayerIds" value={player.id} />
                  {player.lastName}, {player.firstName}
                </label>
              ))}
            </fieldset>
            <button type="submit">Guardar y generar cuadro</button>
          </form>
        ) : (
          <section className="list-panel">
            <h2>Solo lectura</h2>
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
    </main>
  );
}
