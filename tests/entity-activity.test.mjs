import assert from "node:assert/strict";
import test from "node:test";
import { isClubEffectivelyActive } from "../src/lib/entity-activity.ts";

test("a club is active without an assigned federation", () => {
  assert.equal(isClubEffectivelyActive({ active: true, federation: null }), true);
});

test("an inactive federation hides its club without changing the club state", () => {
  const club = { active: true, federation: { active: false } };
  assert.equal(isClubEffectivelyActive(club), false);
  assert.equal(club.active, true);
  assert.equal(isClubEffectivelyActive({ ...club, federation: { active: true } }), true);
});

test("a manually inactive club stays inactive when its federation is active", () => {
  assert.equal(isClubEffectivelyActive({ active: false, federation: { active: true } }), false);
});
