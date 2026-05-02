import { notFound } from "next/navigation";
import { registerPlayerForTournamentAction, saveTournamentAction, saveTournamentSeedsAction, suggestTournamentSeedsAction } from "@/app/admin/actions";
import { Navigation } from "@/app/navigation";
import { GenerateDrawButton } from "@/app/tournaments/generate-draw-button";
import { TournamentMatches } from "@/app/tournaments/[id]/tournament-matches";
import { RankingCodePicker } from "@/src/components/ranking-code-picker";
import { getCurrentUser } from "@/src/lib/auth";
import { categoryRestrictionLabel } from "@/src/lib/category-restrictions";
import { getFeatureSettings, requireFeature } from "@/src/lib/features";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";
import { rankingCodeForScope } from "@/src/lib/ranking-codes";

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

export default async function EditTournamentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireFeature("tournaments");
  const { id } = await params;
  const [tournament, players, clubs, categories, currentUser, dictionary, features] = await Promise.all([
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
    getCurrentUser(),
    getDictionary(),
    getFeatureSettings()
  ]);
  const { t } = dictionary;
  const restrictionText = (category: { genderScope: string; minAge: number | null; maxAge: number | null }) =>
    categoryRestrictionLabel(category, { male: t.male, female: t.female, other: t.other, noRestrictions: t.noRestrictions });

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
        <h1>{t.editTournament}</h1>
        <input type="hidden" name="competitionId" value={tournament.id} />
        <input type="hidden" name="posterUrl" value={tournament.posterUrl ?? ""} />
        <label>{t.name}<input name="name" defaultValue={tournament.name} required /></label>
        <label>{t.description}<textarea name="description" rows={3} defaultValue={tournament.description ?? ""} /></label>
        {tournament.posterUrl ? <img className="tournament-poster-preview" src={tournament.posterUrl} alt={tournament.name} /> : null}
        <label>{t.poster}<input name="poster" type="file" accept="image/*" /></label>
        <label>{t.referee}<input name="refereeName" defaultValue={tournament.refereeName ?? ""} /></label>
        <RankingCodePicker defaultCode={tournament.rankingCode ?? rankingCodeForScope(tournament.rankingScope)} label={t.scoreable} />
        <label>{t.matchFormat}
          <select name="bestOfSets" defaultValue={tournament.bestOfSets}>
            <option value="5">{t.bestOf5}</option>
            <option value="3">{t.bestOf3}</option>
          </select>
        </label>
        <label>{t.hostClub}
          <select name="hostClubId" defaultValue={tournament.hostClubId ?? ""} required>
            {editableClubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
          </select>
        </label>
        <div className="form-row">
          <label>{t.registrationDeadline}<input name="registrationDeadline" type="date" defaultValue={registrationDeadlineValue} required /></label>
          <label>{t.start}<input name="startsAt" type="date" defaultValue={dateInputValue(tournament.startsAt)} required /></label>
        </div>
        <label>{t.end}<input name="endsAt" type="date" defaultValue={dateInputValue(tournament.endsAt)} required /></label>
        <fieldset className="check-grid">
          <legend>{t.categories}</legend>
          {categories.map((category) => (
            <label key={category.id}>
              <input type="checkbox" name="categoryIds" value={category.id} defaultChecked={selectedCategoryIds.has(category.id)} />
              {category.name} · {restrictionText(category)}
            </label>
          ))}
        </fieldset>
        <button type="submit" name="mode" value="save">{t.saveTournament}</button>
        {registrationStillOpen ? (
          <p className="warning-box">{t.registrationStillOpenDrawWarning}</p>
        ) : null}
        {!hasSelectedSeeds ? (
          <p className="warning-box">{t.noSeedsDrawWarning}</p>
        ) : null}
        <GenerateDrawButton
          registrationDeadline={registrationDeadlineValue}
          label={t.saveAndGenerateDraw}
          earlyDeadlineMessage={t.registrationStillOpenDrawWarning}
          noSeedsMessage={t.noSeedsDrawConfirmWarning}
          continueMessage={t.generateDrawAnyway}
        />
      </form>
      <section className="list-panel full-width">
        <h2>{t.tournamentCategories}</h2>
        {tournament.categories.map((competitionCategory) => {
          const participants = participantsByCategory.get(competitionCategory.id) ?? [];
          const eligiblePlayers = players.filter((player) =>
            playerMeetsCategoryRestrictions(player, competitionCategory.category, eligibilityReferenceDate)
          );

          return (
            <div className="category-config-card" key={competitionCategory.id}>
              <h3>{competitionCategory.category.name}</h3>
              <p className="muted">{t.restrictions}: {restrictionText(competitionCategory.category)}</p>
              <div className="category-config-grid">
                <form className="compact-form" action={saveTournamentSeedsAction}>
                  <input type="hidden" name="competitionCategoryId" value={competitionCategory.id} />
                  <fieldset className="check-grid">
                    <legend>{t.seeds}</legend>
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
                    ) : null) : <p className="muted">{t.noPlayersEnrolledInCategory}</p>}
                  </fieldset>
                  <div className="form-actions">
                    <button type="submit">{t.saveSeeds}</button>
                    <button type="submit" formAction={suggestTournamentSeedsAction}>{t.selectByRanking}</button>
                  </div>
                </form>
                {features.tournament_online_registration ? (
                  <form className="compact-form" action={registerPlayerForTournamentAction}>
                    <input type="hidden" name="competitionCategoryId" value={competitionCategory.id} />
                    <label>{t.registerPlayer}
                      <select name="playerId" required>
                        {eligiblePlayers.map((player) => (
                          <option key={player.id} value={player.id}>
                            {player.lastName}, {player.firstName} · {player.memberships[0]?.clubNameAtThatTime ?? t.independent}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type="submit" disabled={!eligiblePlayers.length}>{t.registerPlayer}</button>
                  </form>
                ) : null}
              </div>
              {participants.length ? participants.map((participant) => (
                <p key={participant.id}>
                  {participant.player ? `${participant.player.lastName}, ${participant.player.firstName}` : t.playerWithoutData} · {participant.player?.memberships[0]?.clubNameAtThatTime ?? t.independent}
                </p>
              )) : <p className="muted">{t.noRegisteredPlayers}</p>}
            </div>
          );
        })}
      </section>
      <TournamentMatches competitionId={tournament.id} canEdit={canEdit} />
    </main>
  );
}
