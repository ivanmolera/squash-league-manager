type CategoryLocale = "ca" | "es" | "en";

const categoryNames: Record<string, Record<CategoryLocale, string>> = {
  Open: { ca: "Open", es: "Open", en: "Open" },
  Primera: { ca: "Primera", es: "Primera", en: "First division" },
  Segunda: { ca: "Segona", es: "Segunda", en: "Second division" },
  Tercera: { ca: "Tercera", es: "Tercera", en: "Third division" },
  Femenina: { ca: "Femenina", es: "Femenina", en: "Women's" }
};

export function localizeCategoryName(name: string, locale: string) {
  const language: CategoryLocale = locale === "ca" || locale === "en" ? locale : "es";
  const fixedName = categoryNames[name];
  if (fixedName) return fixedName[language];

  const match = /^(Masc|Fem) (\+\d+|Sub-\d+)$/.exec(name);
  if (!match) return name;
  if (language !== "en") return name;

  const prefix = match[1] === "Masc" ? "Men" : "Women";
  const age = match[2].startsWith("Sub-") ? `U${match[2].slice(4)}` : match[2];
  return `${prefix} ${age}`;
}
