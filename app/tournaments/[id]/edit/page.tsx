import { notFound } from "next/navigation";
import { registerPlayerForTournamentAction, saveTournamentAction, saveTournamentSeedsAction, suggestTournamentSeedsAction } from "@/app/admin/actions";
import { Navigation } from "@/app/navigation";
import { GenerateDrawButton } from "@/app/tournaments/generate-draw-button";
import { TournamentMatches } from "@/app/tournaments/[id]/tournament-matches";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

function dateInputValue(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function playerAgeAt(referenceDate: Date, birthDate: Date | null) {
  if (!birthDate) return null;

  let age = referenceDate.getFullYear() - birthDate.getFullYear();
  const birthdayThisYear = new Date(referenceDate);
  birthdayThisYear.setMonth(birthDate.getMonth(), birthDate.getDate());
  if (referenceDate < birthdayThisYear) age -= 1;
  return age;
}

function playerMeetsCategoryRestrictions(
  player: { gender: string; birthDate: Date | null },
  category: { genderScope: string; minAge: number | null; maxAge: number | null },
  referenceDate: Date
) {
  if (category.genderScope !== "not_specified" && player.gender !== category.genderScope) {
    return false;
  }

  const age = playerAgeAt(referenceDate, player.birthDate);
  if (category.minAge !== null && (age === null || age < category.minAge)) {
    return false;
  }

  if (category.maxAge !== null && (age === null || age > category.maxAge)) {
    return false;
  }

  return true;
}

function restrictionLabel(category: { genderScope: string; minAge: number | null; maxAge: number | null }) {
  const restrictions = [];
  if (category.genderScope === "male") restrictions.push("masculina");
  if (category.genderScope === "female") restrictions.push("femenina");
  if (category.minAge !== null) restrictions.push(`+${category.minAge}`);
  if (category.maxAge !== null) restrictions.push(`sub${category.maxAge}`);
  return restrictions.length ? restrictions.join(" · ") : "mixta";
}

export default async function EditTournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [tournament, players, clubs, categories, currentUser] = await Promise.all([
    prisma.competition.findUnique({
      where: { id },
      include: {
        participants: {
          include: {
            player: {
              include: {
                memberships: {
                  where: { toDate: null },
                  include: { club: true },
                  orderBy: { fromDate: "desc" },
                  take: 1
                }
              }
            },
            competitionCategory: { include: { category: true } }
          }
        },
        categories: { include: { category: true, seeds: true } },
        hostClub: true
      }
    }),
    prisma.player.findMany({
      include: {
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
    prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    getCurrentUser()
  ]);

  if (!tournament || tournament.type !== "tournament") notFound();
  const isAdmin = Boolean(currentUser?.roles.some((role) => role.role === "admin"));
  const canEdit = isAdmin || tournament.hostClub?.managerUserId === currentUser?.id;
  if (!canEdit) notFound();

  const editableClubs = isAdmin ? clubs : clubs.filter((club) => club.managerUserId === currentUser?.id);
  const selectedCategoryIds = new Set(tournament.categories.map((category) => category.categoryId));
  const selectedSeeds = new Set(
    tournament.categories.flatMap((category) => category.seeds.map((seed) => `${category.id}:${seed.playerId}`))
  );
  const participantsByCategory = new Map<string, typeof tournament.participants>();
  for (const participant of tournament.participants) {
    const rows = participantsByCategory.get(participant.competitionCategoryId) ?? [];
    rows.push(participant);
    participantsByCategory.set(participant.competitionCategoryId, rows);
  }
  const registrationDeadlineValue = dateInputValue(tournament.registrationDeadline);
  const registrationStillOpen = tournament.registrationDeadline ? tournament.registrationDeadline >= new Date() : false;
  const hasSelectedSeeds = selectedSeeds.size > 0;
  const eligibilityReferenceDate = tournament.startsAt ?? new Date();

  return (
    <main className="app-shell">
      <Navigation />
      <form className="admin-form wide-form" action={saveTournamentAction}>
        <h1>Editar torneo</h1>
        <input type="hidden" name="competitionId" value={tournament.id} />
        <label>Nombre<input name="name" defaultValue={tournament.name} required /></label>
        <label>Descripción<textarea name="description" rows={3} defaultValue={tournament.description ?? ""} /></label>
        <label>Juez árbitro<input name="refereeName" defaultValue={tournament.refereeName ?? ""} /></label>
        <label>Tipo de ránking
          <select name="rankingScope" defaultValue={tournament.rankingScope}>
            <option value="none">No puntúa para ránking</option>
            <option value="autonomic">Ránking autonómico</option>
            <option value="state">Ránking estatal</option>
            <option value="psa">Ránking PSA</option>
          </select>
        </label>
        <label>Formato de partido
          <select name="bestOfSets" defaultValue={tournament.bestOfSets}>
            <option value="5">Al mejor de 5 sets</option>
            <option value="3">Al mejor de 3 sets</option>
          </select>
        </label>
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
        <fieldset className="check-grid">
          <legend>Categorías</legend>
          {categories.map((category) => (
            <label key={category.id}>
              <input type="checkbox" name="categoryIds" value={category.id} defaultChecked={selectedCategoryIds.has(category.id)} />
              {category.name} · {restrictionLabel(category)}
            </label>
          ))}
        </fieldset>
        <button type="submit" name="mode" value="save">Guardar torneo</button>
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
      <section className="list-panel full-width">
        <h2>Categorías del torneo</h2>
        {tournament.categories.map((competitionCategory) => {
          const participants = participantsByCategory.get(competitionCategory.id) ?? [];
          const eligiblePlayers = players.filter((player) =>
            playerMeetsCategoryRestrictions(player, competitionCategory.category, eligibilityReferenceDate)
          );

          return (
            <div className="category-config-card" key={competitionCategory.id}>
              <h3>{competitionCategory.category.name}</h3>
              <p className="muted">Restricciones: {restrictionLabel(competitionCategory.category)}</p>
              <div className="category-config-grid">
                <form className="compact-form" action={saveTournamentSeedsAction}>
                  <input type="hidden" name="competitionCategoryId" value={competitionCategory.id} />
                  <fieldset className="check-grid">
                    <legend>Cabezas de serie</legend>
                    {participants.length ? participants.map((participant) => participant.player ? (
                      <label key={participant.id}>
                        <input
                          type="checkbox"
                          name="seedPlayerIds"
                          value={participant.player.id}
                          defaultChecked={selectedSeeds.has(`${competitionCategory.id}:${participant.player.id}`)}
                        />
                        {participant.player.lastName}, {participant.player.firstName}
                      </label>
                    ) : null) : <p className="muted">No hay jugadores inscritos en esta categoría.</p>}
                  </fieldset>
                  <div className="form-actions">
                    <button type="submit">Guardar cabezas de serie</button>
                    <button type="submit" formAction={suggestTournamentSeedsAction}>Seleccionar por ránking</button>
                  </div>
                </form>
                <form className="compact-form" action={registerPlayerForTournamentAction}>
                  <input type="hidden" name="competitionCategoryId" value={competitionCategory.id} />
                  <label>Inscribir jugador
                    <select name="playerId" required>
                      {eligiblePlayers.map((player) => (
                        <option key={player.id} value={player.id}>
                          {player.lastName}, {player.firstName} · {player.memberships[0]?.clubNameAtThatTime ?? "Independiente"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="submit" disabled={!eligiblePlayers.length}>Inscribir jugador</button>
                </form>
              </div>
              {participants.length ? participants.map((participant) => (
                <p key={participant.id}>
                  {participant.player ? `${participant.player.lastName}, ${participant.player.firstName}` : "Jugador sin datos"} · {participant.player?.memberships[0]?.clubNameAtThatTime ?? "Independiente"}
                </p>
              )) : <p className="muted">Sin inscritos.</p>}
            </div>
          );
        })}
      </section>
      <TournamentMatches competitionId={tournament.id} canEdit={canEdit} />
    </main>
  );
}
