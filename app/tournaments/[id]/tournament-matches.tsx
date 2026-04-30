import { MatchResultForm } from "@/app/match-result-form";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";

type TournamentMatch = Awaited<ReturnType<typeof getTournamentMatches>>[number];
type TournamentDraw = Awaited<ReturnType<typeof getTournamentDraws>>[number];
type BracketMatchType = "tournament_knockout" | "tournament_consolation";

async function getTournamentMatches(competitionId: string, competitionCategoryId?: string) {
  return prisma.match.findMany({
    where: { competitionId, ...(competitionCategoryId ? { competitionCategoryId } : {}) },
    include: {
      competition: { select: { bestOfSets: true, hostClub: { select: { name: true } } } },
      sets: { orderBy: { setNumber: "asc" } }
    },
    orderBy: [{ roundNumber: "asc" }, { matchOrder: "asc" }, { bracketPosition: "asc" }]
  });
}

async function getTournamentDraws(competitionId: string, competitionCategoryId?: string) {
  return prisma.competitionCategory.findMany({
    where: { competitionId, format: "knockout", ...(competitionCategoryId ? { id: competitionCategoryId } : {}) },
    include: {
      category: true,
      drawEntries: { orderBy: { bracketPosition: "asc" } }
    },
    orderBy: { createdAt: "asc" }
  });
}

function dateTime(value: Date | null, locale: string, noDateLabel: string) {
  return value ? value.toLocaleString(locale, { dateStyle: "short", timeStyle: "short" }) : noDateLabel;
}

function scoreText(match: TournamentMatch, pendingLabel: string) {
  const score = scoreParts(match, pendingLabel);
  if (typeof score === "string") return score;
  return score.partials ? `${score.main} (${score.partials})` : score.main;
}

function scoreParts(match: TournamentMatch, pendingLabel: string) {
  if (match.status === "bye") return "BYE";
  if (!match.sets.length) return { main: pendingLabel, partials: "" };

  const homeSets = match.sets.filter((set) => set.homePoints > set.awayPoints).length;
  const awaySets = match.sets.filter((set) => set.awayPoints > set.homePoints).length;
  const sets = match.sets.map((set) => `${set.homePoints}-${set.awayPoints}`).join(", ");
  return { main: `${homeSets}-${awaySets}`, partials: sets };
}

function ScoreDisplay({ match, pendingLabel }: { match: TournamentMatch; pendingLabel: string }) {
  const score = scoreParts(match, pendingLabel);
  if (typeof score === "string") return <>{score}</>;

  return (
    <>
      <strong>{score.main}</strong>
      {score.partials ? <span> ({score.partials})</span> : null}
    </>
  );
}

function tournamentVenueName(match: TournamentMatch, noVenueLabel: string) {
  return match.homeClubNameAtMatchTime ?? match.competition.hostClub?.name ?? noVenueLabel;
}

function playerName(name: string | null | undefined, isBye: boolean | undefined, pendingLabel: string) {
  if (isBye) return "BYE";
  return name ?? pendingLabel;
}

function sideSets(match: TournamentMatch | undefined, side: "home" | "away") {
  if (!match?.sets.length) return "";

  return String(match.sets.filter((set) => side === "home" ? set.homePoints > set.awayPoints : set.awayPoints > set.homePoints).length);
}

function BracketMatchBox({
  match,
  fallbackHome,
  fallbackAway,
  pendingLabel
}: {
  match?: TournamentMatch;
  fallbackHome?: TournamentDraw["drawEntries"][number];
  fallbackAway?: TournamentDraw["drawEntries"][number];
  pendingLabel: string;
}) {
  const homeId = match?.homePlayerId ?? fallbackHome?.playerId ?? null;
  const awayId = match?.awayPlayerId ?? fallbackAway?.playerId ?? null;
  const homeName = playerName(match?.homePlayerNameAtMatchTime ?? fallbackHome?.playerNameAtTime, fallbackHome?.isBye, pendingLabel);
  const awayName = playerName(match?.awayPlayerNameAtMatchTime ?? fallbackAway?.playerNameAtTime, fallbackAway?.isBye, pendingLabel);
  const homeWinner = Boolean(homeId && match?.winnerPlayerId === homeId);
  const awayWinner = Boolean(awayId && match?.winnerPlayerId === awayId);
  const showMatchScore = Boolean(match && (match.status === "played" || match.status === "bye" || match.sets.length));

  return (
    <div className={`bracket-match${showMatchScore ? " is-complete" : ""}`}>
      <div className={`bracket-player${homeWinner ? " is-winner" : ""}`}>
        <span className="bracket-player-name">{homeName}</span>
        <span className="bracket-player-score">{homeWinner && match?.status === "bye" ? "W" : sideSets(match, "home")}</span>
      </div>
      <div className={`bracket-player${awayWinner ? " is-winner" : ""}`}>
        <span className="bracket-player-name">{awayName}</span>
        <span className="bracket-player-score">{awayWinner && match?.status === "bye" ? "W" : sideSets(match, "away")}</span>
      </div>
      {showMatchScore && match ? <p><ScoreDisplay match={match} pendingLabel={pendingLabel} /></p> : null}
    </div>
  );
}

function TournamentBracket({
  title,
  entries,
  matches,
  matchType,
  pendingLabel
}: {
  title: string;
  entries: TournamentDraw["drawEntries"];
  matches: TournamentMatch[];
  matchType: BracketMatchType;
  pendingLabel: string;
}) {
  if (!entries.length) return null;

  const bracketSize = entries.length;
  const rounds = Math.ceil(Math.log2(Math.max(bracketSize, 2)));
  const finalMatch = matches.find((match) => match.matchType === matchType && match.roundNumber === rounds && match.bracketPosition === 1);
  const championName = finalMatch?.winnerPlayerId === finalMatch?.homePlayerId
    ? finalMatch?.homePlayerNameAtMatchTime
    : finalMatch?.winnerPlayerId === finalMatch?.awayPlayerId
      ? finalMatch?.awayPlayerNameAtMatchTime
      : null;
  const matchFor = (roundNumber: number, bracketPosition: number) =>
    matches.find((match) => match.matchType === matchType && match.roundNumber === roundNumber && match.bracketPosition === bracketPosition);

  return (
    <div className="bracket-block">
      <h3>{title}</h3>
      <div className="bracket-scroll">
        <div className="bracket">
          {Array.from({ length: rounds }, (_, roundIndex) => {
            const roundNumber = roundIndex + 1;
            const slots = Math.max(1, bracketSize / 2 ** roundNumber);
            const roundGap = Math.min(140, 14 + (2 ** (roundNumber - 1) - 1) * 42);
            return (
              <div className="bracket-round" key={roundNumber} style={{ gap: `${roundGap}px` }}>
                {Array.from({ length: slots }, (_, slotIndex) => {
                  const bracketPosition = slotIndex + 1;
                  const home = roundNumber === 1 ? entries[slotIndex * 2] : undefined;
                  const away = roundNumber === 1 ? entries[slotIndex * 2 + 1] : undefined;

                  return (
                    <BracketMatchBox
                      match={matchFor(roundNumber, bracketPosition)}
                      fallbackHome={home}
                      fallbackAway={away}
                      pendingLabel={pendingLabel}
                      key={bracketPosition}
                    />
                  );
                })}
              </div>
            );
          })}
          <div className="bracket-round bracket-champion">
            <div className="bracket-winner-slot">
              <span>{championName ?? pendingLabel}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export async function TournamentMatches({
  competitionId,
  competitionCategoryId,
  canEdit,
  showHeading = true
}: {
  competitionId: string;
  competitionCategoryId?: string;
  canEdit: boolean;
  showHeading?: boolean;
}) {
  const [matches, draws, dictionary] = await Promise.all([
    getTournamentMatches(competitionId, competitionCategoryId),
    getTournamentDraws(competitionId, competitionCategoryId),
    getDictionary()
  ]);
  const { locale, t } = dictionary;

  return (
    <section className="list-panel full-width">
      {showHeading ? <h2>{t.tournament} · {t.calendar}</h2> : null}
      {draws.some((draw) => draw.drawEntries.length) ? (
        <div className="bracket-list">
          {draws.flatMap((draw) => {
            const mainEntries = draw.drawEntries.filter((entry) => entry.bracketType === "main");
            const consolationEntries = draw.drawEntries.filter((entry) => entry.bracketType === "consolation");
            const categoryMatches = matches.filter((match) => match.competitionCategoryId === draw.id);
            return [
              <TournamentBracket title={`${draw.category.name} · ${t.mainDraw}`} entries={mainEntries} matches={categoryMatches} matchType="tournament_knockout" pendingLabel={t.pending} key={`${draw.id}-main`} />,
              <TournamentBracket title={`${draw.category.name} · ${t.consolationDraw}`} entries={consolationEntries} matches={categoryMatches} matchType="tournament_consolation" pendingLabel={t.pending} key={`${draw.id}-consolation`} />
            ];
          })}
        </div>
      ) : null}
      {matches.length ? (
        <div className="calendar-list">
          {matches.map((match) => (
            <article className="match-card" key={match.id}>
              <div>
                <strong>{match.matchType === "tournament_third_place" ? t.thirdPlaceMatch : `${t.round} ${match.roundNumber ?? "-"}`} · {dateTime(match.scheduledAt, locale, t.noDate)}</strong>
                <p>{match.homePlayerNameAtMatchTime ?? "BYE"} vs {match.awayPlayerNameAtMatchTime ?? "BYE"}</p>
                <p>{t.venue}: {tournamentVenueName(match, t.noVenue)}</p>
                <p>{t.result}: <ScoreDisplay match={match} pendingLabel={t.pending} /></p>
              </div>
              {canEdit && match.status !== "bye" && match.homePlayerId && match.awayPlayerId ? (
                <MatchResultForm match={match} labels={{ sets: t.sets, set: t.set, home: t.homeSide, away: t.awaySide, save: t.saveResult }} />
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="muted">{t.noMatches}</p>
      )}
    </section>
  );
}
