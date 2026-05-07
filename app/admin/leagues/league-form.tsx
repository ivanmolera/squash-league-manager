import { saveLeagueAction } from "@/app/admin/actions";
import { LeagueParticipantFields } from "@/app/admin/leagues/league-participant-fields";
import { RankingCodePicker } from "@/src/components/ranking-code-picker";

export function LeagueForm({
  title,
  type,
  clubs,
  labels,
  participants,
  returnTo
}: {
  title: string;
  type: "individual_league" | "team_league";
  clubs: Array<{ id: string; name: string }>;
  labels: Record<string, string>;
  participants: Array<{ id: string; label: string; clubId?: string }>;
  returnTo?: string;
}) {
  const weekdayOptions = [
    ["1", labels.monday],
    ["2", labels.tuesday],
    ["3", labels.wednesday],
    ["4", labels.thursday],
    ["5", labels.friday],
    ["6", labels.saturday],
    ["7", labels.sunday]
  ];

  return (
    <form className="admin-form" action={saveLeagueAction}>
      <h2>{title}</h2>
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <input type="hidden" name="type" value={type} />
      <label>{labels.name}<input name="name" required /></label>
      <label>{labels.description}<textarea name="description" rows={3} /></label>
      <RankingCodePicker defaultCode="none" label={labels.scoreable} />
      <label>{labels.matchFormat}
        <select name="bestOfSets" defaultValue="5">
          <option value="5">{labels.bestOf5}</option>
          <option value="3">{labels.bestOf3}</option>
        </select>
      </label>
      <label>{labels.matchFrequency}
        <select name="matchFrequency" defaultValue="biweekly">
          <option value="weekly">{labels.weekly}</option>
          <option value="biweekly">{labels.biweekly}</option>
        </select>
      </label>
      <label>{labels.preferredMatchDay}
        <select name="preferredMatchWeekday" defaultValue="">
          <option value="">{labels.distributeDuringWeek}</option>
          {weekdayOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <div className="form-row">
        <label>{labels.registrationDeadline}<input name="registrationDeadline" type="date" required /></label>
        <label>{labels.start}<input name="startsAt" type="date" required /></label>
      </div>
      <LeagueParticipantFields
        clubs={clubs}
        filterByClub={type === "individual_league"}
        labels={labels}
        legend={type === "individual_league" ? labels.players : labels.clubs}
        participants={participants}
      />
      <button type="submit">{labels.createAndGenerateMatchdays}</button>
    </form>
  );
}
