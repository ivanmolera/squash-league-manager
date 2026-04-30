import { rankingOptionForCode } from "@/src/lib/ranking-codes";

const provinceToCommunityCode: Record<string, string> = {
  acoruna: "GAL",
  alacant: "VAL",
  alava: "PVA",
  araba: "PVA",
  albacete: "CLM",
  alicante: "VAL",
  almeria: "AND",
  asturias: "AST",
  avila: "CYL",
  badajoz: "EXT",
  barcelona: "CAT",
  bizkaia: "PVA",
  burgos: "CYL",
  caceres: "EXT",
  cadiz: "AND",
  cantabria: "CNT",
  castello: "VAL",
  castellon: "VAL",
  ceuta: "CEU",
  ciudadreal: "CLM",
  cordoba: "AND",
  coruna: "GAL",
  cuenca: "CLM",
  girona: "CAT",
  granada: "AND",
  guadalajara: "CLM",
  gipuzkoa: "PVA",
  guipuzcoa: "PVA",
  huelva: "AND",
  huesca: "ARA",
  illesbalears: "BAL",
  jaen: "AND",
  larioja: "RIO",
  laspalmas: "CAN",
  leon: "CYL",
  lleida: "CAT",
  lugo: "GAL",
  madrid: "MAD",
  malaga: "AND",
  melilla: "MEL",
  murcia: "MUR",
  navarra: "NAV",
  ourense: "GAL",
  palencia: "CYL",
  pontevedra: "GAL",
  salamanca: "CYL",
  santacruzdetenerife: "CAN",
  segovia: "CYL",
  sevilla: "AND",
  soria: "CYL",
  tarragona: "CAT",
  tenerife: "CAN",
  teruel: "ARA",
  toledo: "CLM",
  valencia: "VAL",
  valladolid: "CYL",
  zamora: "CYL",
  zaragoza: "ARA"
};

function normalizeLocation(value: string | null | undefined) {
  return value
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "") ?? "";
}

export function autonomousCommunityForLocation(location: {
  province?: string | null;
  city?: string | null;
}) {
  const code = provinceToCommunityCode[normalizeLocation(location.province)] ??
    provinceToCommunityCode[normalizeLocation(location.city)];

  if (!code) return null;

  const option = rankingOptionForCode(code);
  return {
    code,
    name: option.name
  };
}
