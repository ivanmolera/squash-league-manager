import assert from "node:assert/strict";
import test from "node:test";
import { parseManagerSelection } from "../src/lib/manager-selection.ts";

test("a sports profile can be selected without an access account", () => {
  assert.deepEqual(parseManagerSelection("player:12bbd338-1538-46e0-a3c4-1169cb286604"), {
    kind: "player",
    id: "12bbd338-1538-46e0-a3c4-1169cb286604"
  });
});

test("an access account without a sports profile remains selectable", () => {
  assert.deepEqual(parseManagerSelection("user:12bbd338-1538-46e0-a3c4-1169cb286604"), {
    kind: "user",
    id: "12bbd338-1538-46e0-a3c4-1169cb286604"
  });
});

test("clearing or forging a manager selection is handled explicitly", () => {
  assert.equal(parseManagerSelection(""), null);
  assert.throws(() => parseManagerSelection("player:not-a-uuid"));
  assert.throws(() => parseManagerSelection("admin:12bbd338-1538-46e0-a3c4-1169cb286604"));
});
