export type RankingScopeValue = "none" | "autonomic" | "state" | "psa";

export type RankingOption = {
  code: string;
  name: string;
  scope: RankingScopeValue;
  flagClass?: string;
  imageSrc?: string;
};

export const rankingOptions: RankingOption[] = [
  { code: "none", name: "No puntua", scope: "none" },
  { code: "AND", name: "Andalucía", scope: "autonomic", flagClass: "flag-and" },
  { code: "ARA", name: "Aragón", scope: "autonomic", flagClass: "flag-ara" },
  { code: "AST", name: "Asturias", scope: "autonomic", flagClass: "flag-ast" },
  { code: "BAL", name: "Illes Balears", scope: "autonomic", flagClass: "flag-bal" },
  { code: "CAN", name: "Canarias", scope: "autonomic", flagClass: "flag-can" },
  { code: "CNT", name: "Cantabria", scope: "autonomic", flagClass: "flag-cnt" },
  { code: "CLM", name: "Castilla-La Mancha", scope: "autonomic", flagClass: "flag-clm" },
  { code: "CYL", name: "Castilla y León", scope: "autonomic", flagClass: "flag-cyl" },
  { code: "CAT", name: "Catalunya", scope: "autonomic", flagClass: "flag-cat" },
  { code: "VAL", name: "Comunitat Valenciana", scope: "autonomic", flagClass: "flag-val" },
  { code: "EXT", name: "Extremadura", scope: "autonomic", flagClass: "flag-ext" },
  { code: "GAL", name: "Galicia", scope: "autonomic", flagClass: "flag-gal" },
  { code: "MAD", name: "Madrid", scope: "autonomic", flagClass: "flag-mad" },
  { code: "MUR", name: "Murcia", scope: "autonomic", flagClass: "flag-mur" },
  { code: "NAV", name: "Navarra", scope: "autonomic", flagClass: "flag-nav" },
  { code: "PVA", name: "País Vasco", scope: "autonomic", flagClass: "flag-pva" },
  { code: "RIO", name: "La Rioja", scope: "autonomic", flagClass: "flag-rio" },
  { code: "CEU", name: "Ceuta", scope: "autonomic", flagClass: "flag-ceu" },
  { code: "MEL", name: "Melilla", scope: "autonomic", flagClass: "flag-mel" },
  { code: "ESP", name: "España", scope: "state", flagClass: "flag-esp" },
  { code: "PSA", name: "PSA", scope: "psa", imageSrc: "/images/psa_logo.png" }
];

export const rankingCodeValues = rankingOptions.map((option) => option.code) as [string, ...string[]];

export function rankingOptionForCode(code?: string | null) {
  return rankingOptions.find((option) => option.code === code) ?? rankingOptions[0];
}

export function rankingScopeForCode(code?: string | null): RankingScopeValue {
  return rankingOptionForCode(code).scope;
}

export function rankingCodeForScope(scope?: string | null) {
  if (scope === "autonomic") return "CAT";
  if (scope === "state") return "ESP";
  if (scope === "psa") return "PSA";
  return "none";
}
