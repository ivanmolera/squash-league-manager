import { rankingOptionForCode, rankingOptions } from "@/src/lib/ranking-codes";

export function RankingCodeBadge({ code }: { code?: string | null }) {
  const option = rankingOptionForCode(code);

  if (option.imageSrc) {
    return (
      <span
        className={`ranking-flag ranking-flag-image ranking-flag-code-${option.code.toLowerCase()}`}
        title={option.name}
      >
        <img src={option.imageSrc} alt={option.name} />
      </span>
    );
  }

  return (
    <span className={`ranking-flag ${option.flagClass ?? "flag-none"}`} title={option.name}>
      {option.code === "none" ? "-" : option.code}
    </span>
  );
}

export function RankingCodePicker({
  defaultCode,
  label,
  activeCodes,
  inactiveCurrentLabel
}: {
  defaultCode?: string | null;
  label: string;
  activeCodes: string[];
  inactiveCurrentLabel: string;
}) {
  const selectedCode = rankingOptionForCode(defaultCode).code;
  const activeOptions = rankingOptions.filter((option) => activeCodes.includes(option.code));
  const inactiveCurrent = selectedCode !== "none" && !activeCodes.includes(selectedCode);

  return (
    <fieldset className="ranking-code-picker">
      <legend>{label}</legend>
      <div>
        {inactiveCurrent ? (
          <label title={inactiveCurrentLabel}>
            <input type="radio" name="rankingCode" value={selectedCode} defaultChecked />
            <span className="ranking-inactive-current">{inactiveCurrentLabel}: {selectedCode}</span>
          </label>
        ) : null}
        {activeOptions.map((option) => (
          <label key={option.code} title={option.name}>
            <input
              type="radio"
              name="rankingCode"
              value={option.code}
              defaultChecked={option.code === selectedCode}
            />
            <RankingCodeBadge code={option.code} />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
