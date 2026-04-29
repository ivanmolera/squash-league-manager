type ClubCrestSize = "tiny" | "small" | "large";

export function ClubCrest({
  logoUrl,
  clubName,
  size = "small"
}: {
  logoUrl?: string | null;
  clubName: string;
  size?: ClubCrestSize;
}) {
  const className = `club-crest club-crest-${size}`;

  if (logoUrl) {
    return <img className={className} src={logoUrl} alt={`Escudo de ${clubName}`} />;
  }

  return (
    <span className={`${className} club-crest-fallback`} aria-label={`Escudo genérico de ${clubName}`} role="img">
      <span className="club-crest-shield" />
    </span>
  );
}
