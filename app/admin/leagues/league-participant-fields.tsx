"use client";

import { useState } from "react";

export function LeagueParticipantFields({
  clubs,
  defaultHostClubId = "",
  filterByClub = false,
  labels,
  legend,
  participants,
  selectedIds = []
}: {
  clubs: Array<{ id: string; name: string }>;
  defaultHostClubId?: string;
  filterByClub?: boolean;
  labels: Record<string, string>;
  legend: string;
  participants: Array<{ id: string; label: string; clubId?: string }>;
  selectedIds?: string[];
}) {
  const [hostClubId, setHostClubId] = useState(defaultHostClubId);
  const selected = new Set(selectedIds);
  const visibleParticipants = filterByClub && hostClubId
    ? participants.filter((participant) => participant.clubId === hostClubId)
    : participants;

  return (
    <>
      <label>{labels.restrictedClub}
        <select name="hostClubId" value={hostClubId} onChange={(event) => setHostClubId(event.target.value)}>
          <option value="">{labels.noRestriction}</option>
          {clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
        </select>
      </label>
      <fieldset className="check-grid">
        <legend>{legend}</legend>
        {visibleParticipants.length ? visibleParticipants.map((participant) => (
          <label key={participant.id}>
            <input type="checkbox" name="participantIds" value={participant.id} defaultChecked={selected.has(participant.id)} />
            {participant.label}
          </label>
        )) : <p className="muted">{labels.noPlayersForSelectedClub}</p>}
      </fieldset>
    </>
  );
}
