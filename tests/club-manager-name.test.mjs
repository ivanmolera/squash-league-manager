import assert from "node:assert/strict";
import test from "node:test";
import { formatClubManagerName } from "../src/lib/names.ts";

test("club manager names show first name followed by both surnames", () => {
  assert.equal(formatClubManagerName({ firstName: "Martí", lastName: "Ferrer Pardo" }, null), "Martí Ferrer Pardo");
  assert.equal(formatClubManagerName({ firstName: "Raul", lastName: "Ruiz" }, null), "Raul Ruiz");
});

test("account-only managers retain natural name order", () => {
  assert.equal(formatClubManagerName(null, { displayName: "Joan Casahuga", email: "joan@example.com" }), "Joan Casahuga");
  assert.equal(formatClubManagerName(null, { displayName: "Ruiz, Raul", email: "raul@example.com" }), "Raul Ruiz");
  assert.equal(formatClubManagerName(null, { displayName: null, email: "club@example.com" }), "club@example.com");
  assert.equal(formatClubManagerName(null, null), null);
});
