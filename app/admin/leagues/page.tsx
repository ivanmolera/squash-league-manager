import Link from "next/link";
import { saveLeagueAction } from "@/app/admin/actions";
import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

export default async function LeaguesPage() {
  const [players, clubs, leagues, currentUser] = await Promise.all([
    prisma.player.findMany({
      include: {
        user: true,
        memberships: {
          where: { toDate: null },
          include: { club: true },
          orderBy: { fromDate: "desc" },
          take: 1
        }
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
    }),
    prisma.club.findMany({ orderBy: [{ province: "asc" }, { name: "asc" }] }),
    prisma.competition.findMany({
      where: { type: { in: ["individual_league", "team_league"] } },
      include: { participants: true },
      orderBy: [{ startsAt: "desc" }, { name: "asc" }]
    }),
    getCurrentUser()
  ]);
  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));
  const now = new Date();
  const activeLeagues = leagues.filter((league) => !league.endsAt || league.endsAt >= now);
  const completedLeagues = leagues.filter((league) => league.endsAt && league.endsAt < now);

  return (
    <main className="app-shell">
      <Navigation />
      <section className="page-heading">
        <p className="eyebrow">Admin</p>
        <h1>Ligas</h1>
        <p className="muted">Inicia sesión como admin para crear o modificar ligas.</p>
      </section>

      {isAdmin ? (
        <section className="work-grid">
          <LeagueForm title="Liga individual" type="individual_league" clubs={clubs} participants={players.map((player) => ({
            id: player.id,
            label: `${player.lastName}, ${player.firstName} · ${player.memberships[0]?.clubNameAtThatTime ?? "Independiente"}`,
            clubId: player.memberships[0]?.clubId ?? ""
          }))} />
          <LeagueForm title="Liga por equipos" type="team_league" clubs={clubs} participants={clubs.map((club) => ({
            id: club.id,
            label: `${club.province ?? "Sin provincia"} - ${club.name}`
          }))} />
        </section>
      ) : null}

      <LeagueList title="Ligas en curso" leagues={activeLeagues} isAdmin={isAdmin} />
      <LeagueList title="Ligas completadas" leagues={completedLeagues} isAdmin={isAdmin} completed />
    </main>
  );
}

function LeagueList({
  title,
  leagues,
  isAdmin,
  completed = false
}: {
  title: string;
  leagues: Awaited<ReturnType<typeof prisma.competition.findMany>>;
  isAdmin: boolean;
  completed?: boolean;
}) {
  return (
    <section className="list-panel full-width">
      <h2>{title}</h2>
      <div className="table-list">
        {leagues.length ? leagues.map((league) => (
          <article className={`league-row${completed ? " is-ended" : ""}`} key={league.id}>
            <div>
              <strong><Link href={`/leagues/${league.id}`}>{league.name}</Link></strong>
              <span>{league.type === "individual_league" ? "Individual" : "Por equipos"}</span>
            </div>
            <p className="date-row">
              <span>Inscripción: {league.registrationDeadline?.toLocaleDateString("es-ES") ?? "Sin límite"}</span>
              <span>Inicio: {league.startsAt?.toLocaleDateString("es-ES")}</span>
              <span>Fin: {league.endsAt?.toLocaleDateString("es-ES")}</span>
            </p>
            {isAdmin ? <Link className="secondary-link" href={`/leagues/${league.id}/edit`}>Editar</Link> : null}
          </article>
        )) : <p className="muted">No hay ligas.</p>}
      </div>
    </section>
  );
}

function LeagueForm({
  title,
  type,
  clubs,
  participants
}: {
  title: string;
  type: "individual_league" | "team_league";
  clubs: Array<{ id: string; name: string }>;
  participants: Array<{ id: string; label: string; clubId?: string }>;
}) {
  return (
    <form className="admin-form" action={saveLeagueAction}>
      <h2>{title}</h2>
      <input type="hidden" name="type" value={type} />
      <label>Nombre<input name="name" required /></label>
      <label>Descripción<textarea name="description" rows={3} /></label>
      <label>Formato de partido
        <select name="bestOfSets" defaultValue="5">
          <option value="5">Al mejor de 5 sets</option>
          <option value="3">Al mejor de 3 sets</option>
        </select>
      </label>
      <label>Club restringido
        <select name="hostClubId" defaultValue="">
          <option value="">Sin restricción</option>
          {clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
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
        <legend>{type === "individual_league" ? "Jugadores" : "Clubes"}</legend>
        {participants.map((participant) => (
          <label key={participant.id}>
            <input type="checkbox" name="participantIds" value={participant.id} data-club-id={participant.clubId ?? ""} />
            {participant.label}
          </label>
        ))}
      </fieldset>
      <button type="submit">Guardar y generar jornadas</button>
    </form>
  );
}
