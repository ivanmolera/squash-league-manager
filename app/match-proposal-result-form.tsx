import { completeMatchProposalAction } from "@/app/admin/actions";
import type { Dictionary } from "@/src/lib/i18n";

const scoreOptions = ["3-0", "3-1", "3-2", "2-3", "1-3", "0-3"] as const;
const pointOptions = Array.from({ length: 61 }, (_, index) => index);

export function MatchProposalResultForm({
  clubId,
  proposal,
  t
}: {
  clubId: string;
  proposal: {
    id: string;
    proposerPlayer: { firstName: string; lastName: string };
    acceptorPlayer: { firstName: string; lastName: string } | null;
  };
  t: Dictionary;
}) {
  if (!proposal.acceptorPlayer) return null;
  const proposerName = `${proposal.proposerPlayer.firstName} ${proposal.proposerPlayer.lastName}`;
  const acceptorName = `${proposal.acceptorPlayer.firstName} ${proposal.acceptorPlayer.lastName}`;

  return (
    <form className="result-form structured-result-form match-proposal-result-form" action={completeMatchProposalAction}>
      <input type="hidden" name="proposalId" value={proposal.id} />
      <input type="hidden" name="clubId" value={clubId} />
      <label>
        {t.finalResult}
        <select name="matchScore" required aria-label={t.finalResult}>
          <option value="">-</option>
          {scoreOptions.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <fieldset>
        <legend>{t.sets}</legend>
        {Array.from({ length: 5 }, (_, index) => {
          const setNumber = index + 1;
          return (
            <div className="set-score-row" key={setNumber}>
              <span>{t.set} {setNumber}</span>
              <select name={`set${setNumber}HomePoints`} aria-label={`${t.set} ${setNumber} ${proposerName}`}>
                <option value="">-</option>
                {pointOptions.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
              <span>-</span>
              <select name={`set${setNumber}AwayPoints`} aria-label={`${t.set} ${setNumber} ${acceptorName}`}>
                <option value="">-</option>
                {pointOptions.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>
          );
        })}
      </fieldset>
      <p className="muted proposal-result-order">{proposerName} - {acceptorName}</p>
      <button type="submit">{t.completeMatch}</button>
    </form>
  );
}
