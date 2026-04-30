import { saveMatchResultAction } from "@/app/admin/actions";

type MatchResultFormMatch = {
  id: string;
  sets: Array<{ setNumber: number; homePoints: number; awayPoints: number }>;
  competition: { bestOfSets: number };
};

const basePointOptions = Array.from({ length: 61 }, (_, index) => index);

function pointOptions(match: MatchResultFormMatch) {
  const existing = match.sets.flatMap((set) => [set.homePoints, set.awayPoints]);
  return Array.from(new Set([...basePointOptions, ...existing])).sort((left, right) => left - right);
}

function defaultSet(match: MatchResultFormMatch, setNumber: number) {
  return match.sets.find((set) => set.setNumber === setNumber);
}

export function MatchResultForm({
  match,
  labels
}: {
  match: MatchResultFormMatch;
  labels: { sets: string; set: string; home: string; away: string; save: string };
}) {
  const options = pointOptions(match);

  return (
    <form className="result-form structured-result-form" action={saveMatchResultAction}>
      <input type="hidden" name="matchId" value={match.id} />
      <fieldset>
        <legend>{labels.sets}</legend>
        {Array.from({ length: match.competition.bestOfSets }, (_, index) => {
          const setNumber = index + 1;
          const set = defaultSet(match, setNumber);

          return (
            <div className="set-score-row" key={setNumber}>
              <span>{labels.set} {setNumber}</span>
              <select name={`set${setNumber}HomePoints`} defaultValue={set?.homePoints ?? ""} aria-label={`${labels.set} ${setNumber} ${labels.home}`}>
                <option value="">-</option>
                {options.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
              <span>-</span>
              <select name={`set${setNumber}AwayPoints`} defaultValue={set?.awayPoints ?? ""} aria-label={`${labels.set} ${setNumber} ${labels.away}`}>
                <option value="">-</option>
                {options.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>
          );
        })}
      </fieldset>
      <button type="submit">{labels.save}</button>
    </form>
  );
}
