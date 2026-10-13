import assert from "node:assert/strict";
import test from "node:test";
import { formatMatchSchedule, formatMatchScore, isUpcomingScheduledMatch } from "../src/lib/personal-results.ts";

test("a scheduled match is future only while its actual time has not passed", () => {
  const now = new Date("2026-10-13T16:00:00Z");
  assert.equal(isUpcomingScheduledMatch({ scheduledAt: new Date("2026-10-13T17:00:00Z"), leagueMatchday: null }, now), true);
  assert.equal(isUpcomingScheduledMatch({ scheduledAt: new Date("2026-10-13T15:00:00Z"), leagueMatchday: null }, now), false);
});

test("a matchday range remains available through its final local calendar day", () => {
  const leagueMatchday = { startsAt: new Date("2026-10-12T00:00:00Z"), endsAt: new Date("2026-10-13T00:00:00Z") };
  assert.equal(isUpcomingScheduledMatch({ scheduledAt: null, leagueMatchday }, new Date("2026-10-13T20:00:00Z")), true);
  assert.equal(isUpcomingScheduledMatch({ scheduledAt: null, leagueMatchday }, new Date("2026-10-13T22:30:00Z")), false);
  assert.match(formatMatchSchedule({ scheduledAt: null, leagueMatchday }, "es", "Pendiente"), /12 oct.*13 oct/);
});

test("unknown dates stay pending and exact dates include local time", () => {
  assert.equal(formatMatchSchedule({ scheduledAt: null, leagueMatchday: null }, "es", "Por confirmar"), "Por confirmar");
  assert.match(formatMatchSchedule({ scheduledAt: new Date("2026-10-13T17:00:00Z"), leagueMatchday: null }, "es", "Por confirmar"), /19:00/);
});

test("completed scores distinguish sets, walkovers and retirements", () => {
  assert.equal(formatMatchScore({ status: "played", sets: [{ homePoints: 11, awayPoints: 8 }, { homePoints: 8, awayPoints: 11 }, { homePoints: 11, awayPoints: 9 }] }), "2-1 (11-8, 8-11, 11-9)");
  assert.equal(formatMatchScore({ status: "walkover", sets: [] }), "W.O.");
  assert.equal(formatMatchScore({ status: "retired", sets: [] }), "RET");
});
