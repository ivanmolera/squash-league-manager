import { notFound } from "next/navigation";
import { saveLeagueAction } from "@/app/admin/actions";
import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/prisma";
import { LeagueStandings } from "../league-sections";

export const dynamic = "force-dynamic";

function dateInputValue(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

export default async function EditLeaguePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [league, players, clubs, currentUser] = await Promise.all([
    prisma.competition.findUnique({
      where: { id },
      include: { participants: true }
    }),
    prisma.player.findMany({ orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
    prisma.club.findMany({ orderBy: [{ province: "asc" }, { name: "asc" }] }),
    getCurrentUser()
  ]);

  if (!league || !["individual_league", "team_league"].includes(league.type)) notFound();
  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));
  if (!isAdmin) notFound();

  const selectedIds = new Set(league.participants.map((participant) => participant.playerId ?? participant.clubId).filter(Boolean));
  const isIndividual = league.type === "individual_league";
  const participants = isIndividual
    ? players.map((player) => ({ id: player.id, label: `${player.lastName}, ${player.firstName}` }))
    : clubs.map((club) => ({ id: club.id, label: `${club.province ?? "Sin provincia"} - ${club.name}` }));

  return (
    <main className="app-shell">
      <Navigation />
      <form className="admin-form wide-form" action={saveLeagueAction}>
        <h1>Editar liga</h1>
        <input type="hidden" name="competitionId" value={league.id} />
        <input type="hidden" name="type" value={league.type} />
        <label>Nombre<input name="name" defaultValue={league.name} required /></label>
        <label>Descripción<textarea name="description" rows={3} defaultValue={league.description ?? ""} /></label>
        <label>Formato de partido
          <select name="bestOfSets" defaultValue={league.bestOfSets}>
            <option value="5">Al mejor de 5 sets</option>
            <option value="3">Al mejor de 3 sets</option>
          </select>
        </label>
        <label>Club restringido
          <select name="hostClubId" defaultValue={league.hostClubId ?? ""}>
            <option value="">Sin restricción</option>
            {clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
          </select>
        </label>
        <div className="form-row">
          <label>Límite inscripción<input name="registrationDeadline" type="date" defaultValue={dateInputValue(league.registrationDeadline)} required /></label>
          <label>Inicio<input name="startsAt" type="date" defaultValue={dateInputValue(league.startsAt)} required /></label>
        </div>
        <label>Fin<input name="endsAt" type="date" defaultValue={dateInputValue(league.endsAt)} required /></label>
        <fieldset className="check-grid">
          <legend>{isIndividual ? "Jugadores" : "Clubes"}</legend>
          {participants.map((participant) => (
            <label key={participant.id}>
              <input type="checkbox" name="participantIds" value={participant.id} defaultChecked={selectedIds.has(participant.id)} />
              {participant.label}
            </label>
          ))}
        </fieldset>
        <button type="submit">Guardar y regenerar jornadas</button>
      </form>
      <LeagueStandings competitionId={league.id} type={league.type as "individual_league" | "team_league"} />
    </main>
  );
}
