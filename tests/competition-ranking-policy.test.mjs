import assert from "node:assert/strict";
import test from "node:test";
import { federationCodeForTournamentRanking, leagueRankingCode } from "../src/lib/competition-ranking-policy.ts";

test("club leagues keep only their local standings", () => {
  assert.equal(leagueRankingCode("club-id", "none"), "none");
  assert.throws(() => leagueRankingCode("club-id", "CAT"));
  assert.equal(leagueRankingCode(null, "CAT"), "CAT");
});

test("tournament ranking determines its federation", () => {
  assert.equal(federationCodeForTournamentRanking("CAT"), "CAT");
  assert.equal(federationCodeForTournamentRanking("RFES"), "RFES");
  assert.equal(federationCodeForTournamentRanking("PSA"), "RFES");
  assert.equal(federationCodeForTournamentRanking("none"), null);
});
