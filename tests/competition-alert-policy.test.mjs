import assert from "node:assert/strict";
import test from "node:test";
import { daysUntilCompetition, eligibleCompetitionCategories } from "../src/lib/competition-alert-policy.ts";

const category = (id, name, genderScope = "not_specified", minAge = null, maxAge = null) =>
  ({ id, name, genderScope, minAge, maxAge });

test("Madrid calendar days are stable across daylight saving time", () => {
  assert.equal(daysUntilCompetition(new Date("2026-10-31T23:00:00Z"), new Date("2026-10-25T08:00:00Z")), 7);
  assert.equal(daysUntilCompetition(new Date("2026-11-01T09:00:00Z"), new Date("2026-11-01T07:00:00Z")), 0);
});

test("age and gender restrictions use the competition date", () => {
  const categories = [category("open", "Open"), category("women", "Femenina", "female"), category("35", "Masc +35", "male", 35), category("u19", "Masc Sub-19", "male", null, 18)];
  const player = { gender: "male", birthDate: new Date("1991-11-02T00:00:00Z") };
  assert.deepEqual(eligibleCompetitionCategories(categories, player, null, new Date("2026-11-01T00:00:00Z")).map((item) => item.id), ["open"]);
  assert.deepEqual(eligibleCompetitionCategories(categories, player, null, new Date("2026-11-02T00:00:00Z")).map((item) => item.id), ["open", "35"]);
});

test("a level assignment excludes other level divisions but not Open", () => {
  const categories = [category("open", "Open"), category("first", "Primera"), category("second", "Segunda")];
  const player = { gender: "female", birthDate: null };
  assert.deepEqual(eligibleCompetitionCategories(categories, player, "first", new Date("2026-11-01T00:00:00Z")).map((item) => item.id), ["open", "first"]);
});
