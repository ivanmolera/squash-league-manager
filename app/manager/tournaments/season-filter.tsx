"use client";

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
        {seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}
      </select>
    </form>
  );
}
