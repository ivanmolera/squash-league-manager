import Link from "next/link";
import { Trophy } from "lucide-react";
import { MatchResultForm } from "@/app/match-result-form";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";

type TournamentMatch = Awaited<ReturnType<typeof getTournamentMatches>>[number];
type TournamentDraw = Awaited<ReturnType<typeof getTournamentDraws>>[number];
type BracketMatchType = "tournament_knockout" | "tournament_consolation";

const cardWidth = 202;
const centerWidth = 226;
const columnGap = 64;
const sidePadding = 20;
const cardHeight = 106;
const rowHeight = 142;
const headingHeight = 52;

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
  if (match.status === "walkover") return "WO";
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
  pendingLabel,
  finishedLabel,
  locale
}: {
  match?: TournamentMatch;
  fallbackHome?: TournamentDraw["drawEntries"][number];
  fallbackAway?: TournamentDraw["drawEntries"][number];
  pendingLabel: string;
  finishedLabel: string;
  locale: string;
}) {
  const homeId = match?.homePlayerId ?? fallbackHome?.playerId ?? null;
  const awayId = match?.awayPlayerId ?? fallbackAway?.playerId ?? null;
  const homeName = playerName(match?.homePlayerNameAtMatchTime ?? fallbackHome?.playerNameAtTime, fallbackHome?.isBye, pendingLabel);
  const awayName = playerName(match?.awayPlayerNameAtMatchTime ?? fallbackAway?.playerNameAtTime, fallbackAway?.isBye, pendingLabel);
  const homeWinner = Boolean(homeId && match?.winnerPlayerId === homeId);
  const awayWinner = Boolean(awayId && match?.winnerPlayerId === awayId);
  const finished = Boolean(match?.winnerPlayerId);
  const score = match ? scoreParts(match, pendingLabel) : null;
  const status = match?.status === "bye" ? "BYE"
    : match?.status === "walkover" ? "WO"
    : finished ? finishedLabel
    : match?.scheduledAt ? dateTime(match.scheduledAt, locale, pendingLabel) : pendingLabel;

  const content = (
    <div className={`bracket-match${finished ? " is-complete" : ""}`}>
      <span className="bracket-match-status">{status}</span>
      <div className={`bracket-player${homeWinner ? " is-winner" : ""}${finished && !homeWinner ? " is-loser" : ""}`}>
        <span className="bracket-player-name" title={homeName}>{homeName}</span>
        <span className="bracket-player-score">{homeWinner && !match?.sets.length ? "W" : sideSets(match, "home")}</span>
      </div>
      <div className={`bracket-player${awayWinner ? " is-winner" : ""}${finished && !awayWinner ? " is-loser" : ""}`}>
        <span className="bracket-player-name" title={awayName}>{awayName}</span>
        <span className="bracket-player-score">{awayWinner && !match?.sets.length ? "W" : sideSets(match, "away")}</span>
      </div>
      <span className="bracket-match-partials" title={typeof score === "string" ? score : score?.partials ?? ""}>
        {typeof score === "string" ? "\u00a0" : score?.partials ? `${score.main} · ${score.partials}` : "\u00a0"}
      </span>
    </div>
  );

  return match
    ? <Link className="bracket-match-link" href={`#match-${match.id}`}>{content}</Link>
    : <div className="bracket-match-link">{content}</div>;
}

function roundTitle(roundNumber: number, totalRounds: number, labels: { final: string; semifinals: string; quarterfinals: string; roundOf: string }) {
  if (roundNumber === totalRounds) return labels.final;
  const matchesInRound = 2 ** (totalRounds - roundNumber);
  if (matchesInRound === 2) return labels.semifinals;
  if (matchesInRound === 4) return labels.quarterfinals;
  return `${labels.roundOf} ${matchesInRound * 2}`;
}

function TournamentBracket({
  title,
  entries,
  matches,
  matchType,
  pendingLabel,
  labels,
  locale
}: {
  title: string;
  entries: TournamentDraw["drawEntries"];
  matches: TournamentMatch[];
  matchType: BracketMatchType;
  pendingLabel: string;
  labels: { final: string; semifinals: string; quarterfinals: string; roundOf: string; champion: string; finished: string; thirdPlace: string };
  locale: string;
}) {
  if (!entries.length) return null;

  const bracketSize = entries.length;
  const rounds = Math.ceil(Math.log2(Math.max(bracketSize, 2)));
  const sideRounds = rounds - 1;
  const sideMatchCount = Math.max(1, bracketSize / 4);
  const centerY = headingHeight + (sideMatchCount * rowHeight) / 2;
  const centerX = sidePadding + sideRounds * (cardWidth + columnGap);
  const canvasWidth = centerX + centerWidth + sideRounds * (cardWidth + columnGap) + sidePadding;
  const thirdPlaceMatch = matchType === "tournament_knockout"
    ? matches.find((match) => match.matchType === "tournament_third_place")
    : undefined;
  const thirdPlaceTop = centerY + cardHeight / 2 + 36;
  const canvasHeight = Math.max(
    headingHeight + sideMatchCount * rowHeight + 24,
    thirdPlaceMatch ? thirdPlaceTop + cardHeight + 54 : 0
  );
  const finalMatch = matches.find((match) => match.matchType === matchType && match.roundNumber === rounds && match.bracketPosition === 1);
  const championName = finalMatch?.winnerPlayerId
    ? finalMatch.winnerPlayerId === finalMatch.homePlayerId
      ? finalMatch.homePlayerNameAtMatchTime
      : finalMatch.winnerPlayerId === finalMatch.awayPlayerId
        ? finalMatch.awayPlayerNameAtMatchTime
        : null
    : null;
  const matchesByPosition = new Map(matches
    .filter((match) => match.matchType === matchType && match.roundNumber && match.bracketPosition)
    .map((match) => [`${match.roundNumber}:${match.bracketPosition}`, match]));
  const matchFor = (roundNumber: number, bracketPosition: number) => matchesByPosition.get(`${roundNumber}:${bracketPosition}`);
  const stageCenter = (roundNumber: number, index: number) =>
    headingHeight + (index + 0.5) * 2 ** (roundNumber - 1) * rowHeight;
  const leftX = (roundNumber: number) => sidePadding + (roundNumber - 1) * (cardWidth + columnGap);
  const rightX = (roundNumber: number) => centerX + centerWidth + columnGap + (sideRounds - roundNumber) * (cardWidth + columnGap);
  const connectors: string[] = [];

  for (let roundNumber = 1; roundNumber < rounds; roundNumber += 1) {
    if (roundNumber === sideRounds) {
      connectors.push(`M ${leftX(roundNumber) + cardWidth} ${centerY} H ${centerX}`);
      connectors.push(`M ${rightX(roundNumber)} ${centerY} H ${centerX + centerWidth}`);
      continue;
    }

    const pairsPerSide = bracketSize / 2 ** (roundNumber + 2);
    for (let pair = 0; pair < pairsPerSide; pair += 1) {
      const upperY = stageCenter(roundNumber, pair * 2);
      const lowerY = stageCenter(roundNumber, pair * 2 + 1);
      const parentY = stageCenter(roundNumber + 1, pair);
      const leftEdge = leftX(roundNumber) + cardWidth;
      const leftJoin = leftEdge + columnGap / 2;
      const rightEdge = rightX(roundNumber);
      const rightJoin = rightEdge - columnGap / 2;
      connectors.push(`M ${leftEdge} ${upperY} H ${leftJoin} V ${lowerY} H ${leftEdge} M ${leftJoin} ${parentY} H ${leftX(roundNumber + 1)}`);
      connectors.push(`M ${rightEdge} ${upperY} H ${rightJoin} V ${lowerY} H ${rightEdge} M ${rightJoin} ${parentY} H ${rightX(roundNumber + 1) + cardWidth}`);
    }
  }

  const matchCard = (roundNumber: number, bracketPosition: number) => {
    const entryIndex = (bracketPosition - 1) * 2;
    return (
      <BracketMatchBox
        match={matchFor(roundNumber, bracketPosition)}
        fallbackHome={roundNumber === 1 ? entries[entryIndex] : undefined}
        fallbackAway={roundNumber === 1 ? entries[entryIndex + 1] : undefined}
        pendingLabel={pendingLabel}
        finishedLabel={labels.finished}
        locale={locale}
      />
    );
  };

  return (
    <div className="bracket-block">
      <h3>{title}</h3>
      <div className="bracket-scroll" role="region" aria-label={title} tabIndex={0}>
        <div className="bracket-canvas" style={{ width: canvasWidth, height: canvasHeight }}>
          <svg className="bracket-connectors" width={canvasWidth} height={canvasHeight} aria-hidden="true">
            {connectors.map((path, index) => <path d={path} key={index} />)}
          </svg>
          {Array.from({ length: sideRounds }, (_, roundIndex) => {
            const roundNumber = roundIndex + 1;
            const countPerSide = bracketSize / 2 ** (roundNumber + 1);
            return (["left", "right"] as const).map((side) => (
              <div className="bracket-stage" style={{ left: side === "left" ? leftX(roundNumber) : rightX(roundNumber), width: cardWidth }} key={`${side}-${roundNumber}`}>
                <h4 className="bracket-stage-title">{roundTitle(roundNumber, rounds, labels)}</h4>
                {Array.from({ length: countPerSide }, (_, index) => {
                  const position = side === "left" ? index + 1 : countPerSide + index + 1;
                  return (
                    <div className="bracket-stage-match" style={{ top: stageCenter(roundNumber, index) - cardHeight / 2 }} key={position}>
                      {matchCard(roundNumber, position)}
                    </div>
                  );
                })}
              </div>
            ));
          })}
          <div className="bracket-center" style={{ left: centerX, width: centerWidth }}>
            <h4 className="bracket-stage-title">{labels.final}</h4>
            {championName ? (
              <div className="bracket-champion" style={{ top: centerY - cardHeight / 2 - 30 }}>
                <Trophy size={16} aria-hidden="true" /> {labels.champion}: {championName}
              </div>
            ) : null}
            <div className="bracket-stage-match" style={{ top: centerY - cardHeight / 2 }}>
              {matchCard(rounds, 1)}
            </div>
            {thirdPlaceMatch ? (
              <div className="bracket-third-place" style={{ top: thirdPlaceTop }}>
                <h4>{labels.thirdPlace}</h4>
                <BracketMatchBox match={thirdPlaceMatch} pendingLabel={pendingLabel} finishedLabel={labels.finished} locale={locale} />
              </div>
            ) : null}
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
    <section className="tournament-matches-section">
      {showHeading ? <h2>{t.tournament} · {t.calendar}</h2> : null}
      {draws.some((draw) => draw.drawEntries.length) ? (
        <div className="bracket-list">
          {draws.flatMap((draw) => {
            const mainEntries = draw.drawEntries.filter((entry) => entry.bracketType === "main");
            const consolationEntries = draw.drawEntries.filter((entry) => entry.bracketType === "consolation");
            const categoryMatches = matches.filter((match) => match.competitionCategoryId === draw.id);
            return [
              <TournamentBracket title={`${draw.category.name} · ${t.mainDraw}`} entries={mainEntries} matches={categoryMatches} matchType="tournament_knockout" pendingLabel={t.pending} labels={{ final: t.bracketFinal, semifinals: t.bracketSemifinals, quarterfinals: t.bracketQuarterfinals, roundOf: t.bracketRoundOf, champion: t.bracketChampion, finished: t.bracketFinished, thirdPlace: t.thirdPlaceMatch }} locale={locale} key={`${draw.id}-main`} />,
              <TournamentBracket title={`${draw.category.name} · ${t.consolationDraw}`} entries={consolationEntries} matches={categoryMatches} matchType="tournament_consolation" pendingLabel={t.pending} labels={{ final: t.bracketFinal, semifinals: t.bracketSemifinals, quarterfinals: t.bracketQuarterfinals, roundOf: t.bracketRoundOf, champion: t.bracketChampion, finished: t.bracketFinished, thirdPlace: t.thirdPlaceMatch }} locale={locale} key={`${draw.id}-consolation`} />
            ];
          })}
        </div>
      ) : null}
      {matches.length ? (
        <div className="calendar-list">
          {matches.map((match) => (
            <article className="match-card" id={`match-${match.id}`} key={match.id}>
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
