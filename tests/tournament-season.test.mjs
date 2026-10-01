import assert from "node:assert/strict";
import test from "node:test";
import { tournamentSeasonForDate } from "../src/lib/tournament-season.ts";

test("August 2026 tournaments remain in 2025/26", () => {
  const season = tournamentSeasonForDate(new Date("2026-08-31"));
  assert.equal(season.name, "2025/26");
  assert.equal(season.startsAt.toISOString(), "2025-09-01T00:00:00.000Z");
  assert.equal(season.endsAt.toISOString(), "2026-08-31T00:00:00.000Z");
});

test("September 2026 tournaments start the 2026/27 season", () => {
  const season = tournamentSeasonForDate(new Date("2026-09-01"));
  assert.equal(season.name, "2026/27");
  assert.equal(season.startsAt.toISOString(), "2026-09-01T00:00:00.000Z");
  assert.equal(season.endsAt.toISOString(), "2027-08-31T00:00:00.000Z");
});

test("January 2027 stays in 2026/27", () => {
  assert.equal(tournamentSeasonForDate(new Date("2027-01-15")).name, "2026/27");
});

test("invalid tournament dates are rejected", () => {
  assert.throws(() => tournamentSeasonForDate(new Date("invalid")));
});
