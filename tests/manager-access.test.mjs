import assert from "node:assert/strict";
import test from "node:test";
import { syncClubManagerAccount, syncFederationManagerAccount } from "../src/lib/manager-access.ts";

function managerTransaction(entity, byPlayer, byUser) {
  const updates = [];
  const roles = [];
  const model = {
    findUnique: async ({ where }) => where.managerPlayerId ? byPlayer : byUser,
    update: async (input) => { updates.push(input); }
  };
  return { tx: { [entity]: model, userRoleAssignment: { upsert: async (input) => { roles.push(input); } } }, updates, roles };
}

test("an unlinked club manager remains named but gets no account access", async () => {
  const { tx, updates, roles } = managerTransaction("club", { id: "club-1" }, null);
  await syncClubManagerAccount(tx, "player-1", null);
  assert.equal(updates[0].data.managerUserId, null);
  assert.equal(roles.length, 0);
});

test("linking a club manager profile activates account access", async () => {
  const { tx, updates, roles } = managerTransaction("club", { id: "club-1" }, null);
  await syncClubManagerAccount(tx, "player-1", "user-1");
  assert.equal(updates[0].data.managerUserId, "user-1");
  assert.equal(roles[0].create.role, "manager");
});

test("linking a federation manager profile activates federation access", async () => {
  const { tx, updates, roles } = managerTransaction("federation", { id: "federation-1" }, null);
  await syncFederationManagerAccount(tx, "player-1", "user-1");
  assert.equal(updates[0].data.managerUserId, "user-1");
  assert.equal(roles[0].create.role, "manager_fed");
});

test("linking cannot silently transfer a different club", async () => {
  const { tx, updates } = managerTransaction("club", { id: "club-1" }, { id: "club-2", managerPlayerId: null });
  await assert.rejects(syncClubManagerAccount(tx, "player-1", "user-1"), /clubes distintos/);
  assert.equal(updates.length, 0);
});
