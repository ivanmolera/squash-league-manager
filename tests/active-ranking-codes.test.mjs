import assert from "node:assert/strict";
import test from "node:test";
import { rankingCodesForActiveFederations } from "../src/lib/ranking-codes.ts";

test("only active federations with active rankings appear in the picker", () => {
  const codes = rankingCodesForActiveFederations([
    { code: "CAT", ranking: { code: "CAT", active: true } },
    { code: "PVA", ranking: { code: "PVA", active: false } }
  ], true);
  assert.deepEqual(codes, ["none", "CAT"]);
});

test("PSA is selectable only while the Spanish federation and PSA ranking are active", () => {
  const spanish = [{ code: "RFES", ranking: { code: "RFES", active: true } }];
  assert.deepEqual(rankingCodesForActiveFederations(spanish, true), ["none", "RFES", "PSA"]);
  assert.deepEqual(rankingCodesForActiveFederations(spanish, false), ["none", "RFES"]);
  assert.deepEqual(rankingCodesForActiveFederations([], true), ["none"]);
});
