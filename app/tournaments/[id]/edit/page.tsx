import { notFound } from "next/navigation";
import { saveTournamentAction } from "@/app/admin/actions";
import { Navigation } from "@/app/navigation";
import { GenerateDrawButton } from "@/app/tournaments/generate-draw-button";
import { TournamentMatches } from "@/app/tournaments/[id]/tournament-matches";
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
  const seedCandidates = players.filter((player) => selectedParticipants.has(player.id));
  const registrationDeadlineValue = dateInputValue(tournament.registrationDeadline);
  const registrationStillOpen = tournament.registrationDeadline ? tournament.registrationDeadline >= new Date() : false;
  const hasSelectedSeeds = selectedSeeds.size > 0;

  return (
    <main className="app-shell">
      <Navigation />
      <form className="admin-form wide-form" action={saveTournamentAction}>
        <h1>Editar torneo</h1>
        <input type="hidden" name="competitionId" value={tournament.id} />
        <label>Nombre<input name="name" defaultValue={tournament.name} required /></label>
        <label>Descripción<textarea name="description" rows={3} defaultValue={tournament.description ?? ""} /></label>
        <label>Club sede
          <select name="hostClubId" defaultValue={tournament.hostClubId ?? ""} required>
            {editableClubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
          </select>
        </label>
        <div className="form-row">
          <label>Límite inscripción<input name="registrationDeadline" type="date" defaultValue={registrationDeadlineValue} required /></label>
          <label>Inicio<input name="startsAt" type="date" defaultValue={dateInputValue(tournament.startsAt)} required /></label>
        </div>
        <label>Fin<input name="endsAt" type="date" defaultValue={dateInputValue(tournament.endsAt)} required /></label>
        <fieldset className="check-grid tall-check-grid">
          <legend>Jugadores inscritos</legend>
          {players.map((player) => (
            <label key={player.id}>
              <input type="checkbox" name="participantIds" value={player.id} defaultChecked={selectedParticipants.has(player.id)} />
              {player.lastName}, {player.firstName}
            </label>
          ))}
        </fieldset>
        <button type="submit" name="mode" value="save">Guardar torneo e inscritos</button>
        <fieldset className="check-grid">
          <legend>Cabezas de serie manuales</legend>
          {seedCandidates.map((player) => (
            <label key={player.id}>
              <input type="checkbox" name="seedPlayerIds" value={player.id} defaultChecked={selectedSeeds.has(player.id)} />
              {player.lastName}, {player.firstName}
            </label>
          ))}
        </fieldset>
        {registrationStillOpen ? (
          <p className="warning-box">La fecha límite de inscripción todavía no ha pasado. Si generas el cuadro ahora, podrían quedar fuera jugadores inscritos después.</p>
        ) : null}
        {!hasSelectedSeeds ? (
          <p className="warning-box">No hay cabezas de serie seleccionados. Si generas el cuadro así, el sorteo será 100% aleatorio.</p>
        ) : null}
        <GenerateDrawButton
          registrationDeadline={registrationDeadlineValue}
          label="Guardar y generar cuadro"
          earlyDeadlineMessage="La fecha límite de inscripción todavía no ha pasado."
          noSeedsMessage="No hay cabezas de serie seleccionados. El sorteo del cuadro será 100% aleatorio."
          continueMessage="¿Quieres generar el cuadro igualmente?"
        />
      </form>
      <TournamentMatches competitionId={tournament.id} canEdit={canEdit} />
    </main>
  );
}
