import { saveMatchResultAction } from "@/app/admin/actions";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";

type TournamentMatch = Awaited<ReturnType<typeof getTournamentMatches>>[number];

async function getTournamentMatches(competitionId: string) {
  return prisma.match.findMany({
    where: { competitionId },
    include: { sets: { orderBy: { setNumber: "asc" } } },
    orderBy: [{ roundNumber: "asc" }, { matchOrder: "asc" }, { bracketPosition: "asc" }]
  });
}

function dateTime(value: Date | null, locale: string, noDateLabel: string) {
  return value ? value.toLocaleString(locale, { dateStyle: "short", timeStyle: "short" }) : noDateLabel;
}

function scoreText(match: TournamentMatch, pendingLabel: string) {
  if (match.status === "bye") return "BYE";
  if (!match.sets.length) return pendingLabel;

  const homeSets = match.sets.filter((set) => set.homePoints > set.awayPoints).length;
  const awaySets = match.sets.filter((set) => set.awayPoints > set.homePoints).length;
  const sets = match.sets.map((set) => `${set.homePoints}-${set.awayPoints}`).join(", ");
  return `${homeSets}-${awaySets} (${sets})`;
}

function defaultSetInput(match: TournamentMatch) {
  return match.sets.map((set) => `${set.homePoints}-${set.awayPoints}`).join(", ");
}

function ResultForm({ match, labels }: { match: TournamentMatch; labels: { sets: string; save: string } }) {
  return (
    <form className="result-form" action={saveMatchResultAction}>
      <input type="hidden" name="matchId" value={match.id} />
      <label>
        {labels.sets}
        <input name="setScores" defaultValue={defaultSetInput(match)} placeholder="11-8, 11-9, 11-7" />
      </label>
      <button type="submit">{labels.save}</button>
    </form>
  );
}

export async function TournamentMatches({
  competitionId,
  canEdit
}: {
  competitionId: string;
  canEdit: boolean;
}) {
  const [matches, dictionary] = await Promise.all([getTournamentMatches(competitionId), getDictionary()]);
  const { locale, t } = dictionary;

  return (
    <section className="list-panel full-width">
      <h2>{t.tournament} · {t.calendar}</h2>
      {matches.length ? (
        <div className="calendar-list">
          {matches.map((match) => (
            <article className="match-card" key={match.id}>
              <div>
                <strong>Ronda {match.roundNumber ?? "-"} · {dateTime(match.scheduledAt, locale, t.noDate)}</strong>
                <p>{match.homePlayerNameAtMatchTime ?? "BYE"} vs {match.awayPlayerNameAtMatchTime ?? "BYE"}</p>
                <p>{t.venue}: {match.homeClubNameAtMatchTime ?? t.club}</p>
                <p>{t.result}: {scoreText(match, t.pending)}</p>
              </div>
              {canEdit && match.status !== "bye" && match.homePlayerId && match.awayPlayerId ? (
                <ResultForm match={match} labels={{ sets: t.sets, save: t.saveResult }} />
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
