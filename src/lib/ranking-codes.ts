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
  { code: "AND", name: "Andalucía", scope: "autonomic", imageSrc: "/images/flags/and.svg" },
  { code: "ARA", name: "Aragón", scope: "autonomic", imageSrc: "/images/flags/ara.svg" },
  { code: "AST", name: "Asturias", scope: "autonomic", imageSrc: "/images/flags/ast.svg" },
  { code: "BAL", name: "Illes Balears", scope: "autonomic", imageSrc: "/images/flags/bal.svg" },
  { code: "CAN", name: "Canarias", scope: "autonomic", imageSrc: "/images/flags/can.svg" },
  { code: "CNT", name: "Cantabria", scope: "autonomic", imageSrc: "/images/flags/cnt.svg" },
  { code: "CLM", name: "Castilla-La Mancha", scope: "autonomic", imageSrc: "/images/flags/clm.svg" },
  { code: "CYL", name: "Castilla y León", scope: "autonomic", imageSrc: "/images/flags/cyl.svg" },
  { code: "CAT", name: "Catalunya", scope: "autonomic", imageSrc: "/images/flags/cat.svg" },
  { code: "VAL", name: "Comunitat Valenciana", scope: "autonomic", imageSrc: "/images/flags/val.svg" },
  { code: "EXT", name: "Extremadura", scope: "autonomic", imageSrc: "/images/flags/ext.svg" },
  { code: "GAL", name: "Galicia", scope: "autonomic", imageSrc: "/images/flags/gal.svg" },
  { code: "MAD", name: "Madrid", scope: "autonomic", imageSrc: "/images/flags/mad.svg" },
  { code: "MUR", name: "Murcia", scope: "autonomic", imageSrc: "/images/flags/mur.svg" },
  { code: "NAV", name: "Navarra", scope: "autonomic", imageSrc: "/images/flags/nav.svg" },
  { code: "PVA", name: "País Vasco", scope: "autonomic", imageSrc: "/images/flags/pva.svg" },
  { code: "RIO", name: "La Rioja", scope: "autonomic", imageSrc: "/images/flags/rio.svg" },
  { code: "CEU", name: "Ceuta", scope: "autonomic", imageSrc: "/images/flags/ceu.svg" },
  { code: "MEL", name: "Melilla", scope: "autonomic", imageSrc: "/images/flags/mel.svg" },
  { code: "RFES", name: "RFES", scope: "state", imageSrc: "/images/rfes.png" },
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
  if (scope === "state") return "RFES";
  if (scope === "psa") return "PSA";
  return "none";
}
