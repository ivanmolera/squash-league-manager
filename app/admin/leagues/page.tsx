import { saveLeagueAction } from "@/app/admin/actions";
import { Navigation } from "@/app/navigation";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

export default async function LeaguesPage() {
  const [players, clubs, leagues] = await Promise.all([
    prisma.player.findMany({ include: { user: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
    prisma.club.findMany({ orderBy: { name: "asc" } }),
    prisma.competition.findMany({
      where: { type: { in: ["individual_league", "team_league"] } },
      include: { participants: true },
      orderBy: { createdAt: "desc" }
    })
  ]);

  return (
    <main className="app-shell">
      <Navigation />
      <section className="page-heading">
        <p className="eyebrow">Admin</p>
        <h1>Ligas</h1>
        <p className="muted">Creacion, modificacion y generacion automatica de jornadas.</p>
      </section>

      <section className="work-grid">
        <LeagueForm title="Liga individual" type="individual_league" participants={players.map((player) => ({
          id: player.id,
          label: `${player.firstName} ${player.lastName}`
        }))} />
        <LeagueForm title="Liga por equipos" type="team_league" participants={clubs.map((club) => ({
          id: club.id,
          label: club.name
        }))} />
      </section>

      <section className="list-panel full-width">
        <h2>Ligas existentes</h2>
        <div className="table-list">
          {leagues.map((league) => (
            <article className="row-card" key={league.id}>
              <strong>{league.name}</strong>
              <span>{league.type === "individual_league" ? "Individual" : "Equipos"}</span>
              <span>{league.participants.length} participantes</span>
              <span>{league.startsAt?.toLocaleDateString("es-ES")} - {league.endsAt?.toLocaleDateString("es-ES")}</span>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function LeagueForm({
  title,
  type,
  participants
}: {
  title: string;
  type: "individual_league" | "team_league";
  participants: Array<{ id: string; label: string }>;
}) {
  return (
    <form className="admin-form" action={saveLeagueAction}>
      <h2>{title}</h2>
      <input type="hidden" name="type" value={type} />
      <label>Nombre<input name="name" required /></label>
      <label>Descripcion<textarea name="description" rows={3} /></label>
      <div className="form-row">
        <label>Inicio<input name="startsAt" type="date" required /></label>
        <label>Fin<input name="endsAt" type="date" required /></label>
      </div>
      <fieldset className="check-grid">
        <legend>{type === "individual_league" ? "Jugadores" : "Clubes"}</legend>
        {participants.map((participant) => (
          <label key={participant.id}>
            <input type="checkbox" name="participantIds" value={participant.id} />
            {participant.label}
          </label>
        ))}
      </fieldset>
      <button type="submit">Guardar y generar jornadas</button>
    </form>
  );
}
