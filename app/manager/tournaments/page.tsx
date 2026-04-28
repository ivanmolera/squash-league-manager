import { saveTournamentAction } from "@/app/admin/actions";
import { Navigation } from "@/app/navigation";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

export default async function TournamentsPage() {
  const [players, clubs, tournaments] = await Promise.all([
    prisma.player.findMany({ orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
    prisma.club.findMany({ orderBy: { name: "asc" } }),
    prisma.competition.findMany({
      where: { type: "tournament" },
      include: { participants: true },
      orderBy: { createdAt: "desc" }
    })
  ]);

  return (
    <main className="app-shell">
      <Navigation />
      <section className="page-heading">
        <p className="eyebrow">Manager</p>
        <h1>Torneos</h1>
        <p className="muted">Alta de torneo, inscripciones, cabezas de serie y cuadro automatico.</p>
      </section>

      <section className="work-grid">
        <form className="admin-form wide-form" action={saveTournamentAction}>
          <h2>Nuevo torneo</h2>
          <label>Nombre<input name="name" required /></label>
          <label>Descripcion<textarea name="description" rows={3} /></label>
          <label>Club sede
            <select name="hostClubId" required>
              {clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
            </select>
          </label>
          <div className="form-row">
            <label>Inicio<input name="startsAt" type="date" required /></label>
            <label>Fin<input name="endsAt" type="date" required /></label>
          </div>
          <fieldset className="check-grid">
            <legend>Jugadores inscritos</legend>
            {players.map((player) => (
              <label key={player.id}>
                <input type="checkbox" name="participantIds" value={player.id} />
                {player.firstName} {player.lastName}
              </label>
            ))}
          </fieldset>
          <fieldset className="check-grid">
            <legend>Cabezas de serie manuales</legend>
            {players.map((player) => (
              <label key={player.id}>
                <input type="checkbox" name="seedPlayerIds" value={player.id} />
                {player.firstName} {player.lastName}
              </label>
            ))}
          </fieldset>
          <button type="submit">Guardar y generar cuadro</button>
        </form>

        <section className="list-panel">
          <h2>Torneos existentes</h2>
          <div className="table-list">
            {tournaments.map((tournament) => (
              <article className="row-card" key={tournament.id}>
                <strong>{tournament.name}</strong>
                <span>{tournament.participants.length} inscritos</span>
                <span>{tournament.startsAt?.toLocaleDateString("es-ES")} - {tournament.endsAt?.toLocaleDateString("es-ES")}</span>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
