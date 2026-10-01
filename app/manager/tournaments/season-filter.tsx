"use client";

function seasonLabel(name: string) {
  const match = /^(\d{4})\/(\d{2})$/.exec(name);
  return match ? `${match[1]}/${match[1].slice(0, 2)}${match[2]}` : name;
}

export function SeasonFilter({
  seasons,
  selectedSeasonId,
  tab,
  label
}: {
  seasons: Array<{ id: string; name: string }>;
  selectedSeasonId?: string;
  tab: string;
  label: string;
}) {
  return (
    <form className="season-filter" action="/manager/tournaments">
      <input type="hidden" name="tab" value={tab} />
      <label className="sr-only" htmlFor="tournament-season-filter">{label}</label>
      <select
        id="tournament-season-filter"
        name="seasonId"
        defaultValue={selectedSeasonId}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        {seasons.map((season) => <option key={season.id} value={season.id}>{seasonLabel(season.name)}</option>)}
      </select>
    </form>
  );
}
