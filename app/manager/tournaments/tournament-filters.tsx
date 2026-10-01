"use client";

function seasonLabel(name: string) {
  const match = /^(\d{4})\/(\d{2})$/.exec(name);
  return match ? `${match[1]}/${match[1].slice(0, 2)}${match[2]}` : name;
}

export function TournamentFilters({
  seasons,
  selectedSeasonId,
  categories,
  selectedCategoryId,
  tab,
  seasonLabelText,
  categoryLabelText,
  allCategoriesLabel
}: {
  seasons: Array<{ id: string; name: string }>;
  selectedSeasonId?: string;
  categories: Array<{ id: string; name: string }>;
  selectedCategoryId?: string;
  tab: string;
  seasonLabelText: string;
  categoryLabelText: string;
  allCategoriesLabel: string;
}) {
  return (
    <form className="tournament-filters" action="/manager/tournaments">
      <input type="hidden" name="tab" value={tab} />
      <label className="sr-only" htmlFor="tournament-season-filter">{seasonLabelText}</label>
      <select
        id="tournament-season-filter"
        name="seasonId"
        defaultValue={selectedSeasonId}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        {seasons.map((season) => <option key={season.id} value={season.id}>{seasonLabel(season.name)}</option>)}
      </select>
      <label className="sr-only" htmlFor="tournament-category-filter">{categoryLabelText}</label>
      <select
        id="tournament-category-filter"
        name="categoryId"
        defaultValue={selectedCategoryId ?? ""}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        <option value="">{allCategoriesLabel}</option>
        {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
      </select>
    </form>
  );
}
