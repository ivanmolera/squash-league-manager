import { notFound } from "next/navigation";
import { saveTournamentAction } from "@/app/admin/actions";
import { Navigation } from "@/app/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

function dateInputValue(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

export default async function EditTournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [tournament, players, clubs, currentUser] = await Promise.all([
    prisma.competition.findUnique({
      where: { id },
      include: { participants: true, categories: { include: { seeds: true } }, hostClub: true }
    }),
    prisma.player.findMany({ orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
    prisma.club.findMany({ orderBy: [{ province: "asc" }, { name: "asc" }] }),
    getCurrentUser()
  ]);

  if (!tournament || tournament.type !== "tournament") notFound();
  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));
  const canEdit = isAdmin || tournament.hostClub?.managerUserId === currentUser?.id;
  if (!canEdit) notFound();

  const editableClubs = isAdmin ? clubs : clubs.filter((club) => club.managerUserId === currentUser?.id);
  const selectedParticipants = new Set(tournament.participants.map((participant) => participant.playerId).filter(Boolean));
  const selectedSeeds = new Set(tournament.categories.flatMap((category) => category.seeds).map((seed) => seed.playerId));

  return (
    <main className="app-shell">
      <Navigation />
      <form className="admin-form wide-form" action={saveTournamentAction}>
        <h1>Editar torneo</h1>
        <input type="hidden" name="competitionId" value={tournament.id} />
        <label>Nombre<input name="name" defaultValue={tournament.name} required /></label>
        <label>Descripcion<textarea name="description" rows={3} defaultValue={tournament.description ?? ""} /></label>
        <label>Club sede
          <select name="hostClubId" defaultValue={tournament.hostClubId ?? ""} required>
            {editableClubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
          </select>
        </label>
        <div className="form-row">
          <label>Limite inscripcion<input name="registrationDeadline" type="date" defaultValue={dateInputValue(tournament.registrationDeadline)} required /></label>
          <label>Inicio<input name="startsAt" type="date" defaultValue={dateInputValue(tournament.startsAt)} required /></label>
        </div>
        <label>Fin<input name="endsAt" type="date" defaultValue={dateInputValue(tournament.endsAt)} required /></label>
        <fieldset className="check-grid">
          <legend>Jugadores inscritos</legend>
          {players.map((player) => (
            <label key={player.id}>
              <input type="checkbox" name="participantIds" value={player.id} defaultChecked={selectedParticipants.has(player.id)} />
              {player.lastName}, {player.firstName}
            </label>
          ))}
        </fieldset>
        <fieldset className="check-grid">
          <legend>Cabezas de serie manuales</legend>
          {players.map((player) => (
            <label key={player.id}>
              <input type="checkbox" name="seedPlayerIds" value={player.id} defaultChecked={selectedSeeds.has(player.id)} />
              {player.lastName}, {player.firstName}
            </label>
          ))}
        </fieldset>
        <button type="submit">Guardar y regenerar cuadro</button>
      </form>
    </main>
  );
}
