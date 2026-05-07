import { saveTournamentAction } from "@/app/admin/actions";
import { RankingCodePicker } from "@/src/components/ranking-code-picker";

export function TournamentForm({
  categories,
  editableClubs,
  editableFederations,
  isAdmin,
  labels,
  returnTo
}: {
  categories: Array<{ id: string; name: string }>;
  editableClubs: Array<{ id: string; name: string }>;
  editableFederations: Array<{ id: string; name: string; ranking: { code: string } | null }>;
  isAdmin: boolean;
  labels: Record<string, string>;
  returnTo?: string;
}) {
  return (
    <form className="admin-form wide-form" action={saveTournamentAction}>
      <h2>{labels.newTournament}</h2>
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <label>{labels.name}<input name="name" required /></label>
      <label>{labels.description}<textarea name="description" rows={3} /></label>
      <input type="hidden" name="posterUrl" value="" />
      <label>{labels.poster}<input name="poster" type="file" accept="image/*" /></label>
      <label>{labels.referee}<input name="refereeName" /></label>
      {editableFederations.length ? (
        <label>{labels.organizerFederation}
          <select name="organizerFederationId">
            {isAdmin ? <option value="">{labels.noFederation}</option> : null}
            {editableFederations.map((federation) => (
              <option key={federation.id} value={federation.id}>
                {federation.name}{federation.ranking ? ` · ${federation.ranking.code}` : ""}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <RankingCodePicker defaultCode="none" label={labels.scoreable} />
      <label>{labels.matchFormat}
        <select name="bestOfSets" defaultValue="5">
          <option value="5">{labels.bestOf5}</option>
          <option value="3">{labels.bestOf3}</option>
        </select>
      </label>
      <label>{labels.hostClub}
        <select name="hostClubId" required>
          {editableClubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
        </select>
      </label>
      <div className="form-row">
        <label>{labels.registrationDeadline}<input name="registrationDeadline" type="date" required /></label>
        <label>{labels.start}<input name="startsAt" type="date" required /></label>
      </div>
      <div className="form-row">
        <label>{labels.end}<input name="endsAt" type="date" required /></label>
      </div>
      <fieldset className="check-grid">
        <legend>{labels.categories}</legend>
        {categories.map((category) => (
          <label key={category.id}>
            <input type="checkbox" name="categoryIds" value={category.id} />
            {category.name}
          </label>
        ))}
      </fieldset>
      <p className="muted">{labels.tournamentCreatedWithoutPlayers}</p>
      <button type="submit" name="mode" value="save">{labels.saveTournament}</button>
    </form>
  );
}
