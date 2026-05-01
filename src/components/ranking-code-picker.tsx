import { rankingOptionForCode, rankingOptions } from "@/src/lib/ranking-codes";

export function RankingCodeBadge({ code }: { code?: string | null }) {
  const option = rankingOptionForCode(code);

  if (option.imageSrc) {
    return (
      <span
        className={`ranking-flag ranking-flag-image ranking-flag-${option.code.toLowerCase()}`}
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
  label
}: {
  defaultCode?: string | null;
  label: string;
}) {
  const selectedCode = rankingOptionForCode(defaultCode).code;

  return (
    <fieldset className="ranking-code-picker">
      <legend>{label}</legend>
      <div>
        {rankingOptions.map((option) => (
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
