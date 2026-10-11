import assert from "node:assert/strict";
import test from "node:test";
import { isGoogleAuthoritativeEmail, splitGoogleName } from "../src/lib/google-account-policy.ts";

test("Google may auto-link a verified Gmail or Workspace address", () => {
  assert.equal(isGoogleAuthoritativeEmail("user@gmail.com"), true);
  assert.equal(isGoogleAuthoritativeEmail("user@example.org", "example.org"), true);
});

test("a third-party Google account cannot auto-link by email alone", () => {
  assert.equal(isGoogleAuthoritativeEmail("user@example.org"), false);
  assert.equal(isGoogleAuthoritativeEmail("user@example.org", "other.org"), false);
});

test("Google names work with and without structured name claims", () => {
  assert.deepEqual(splitGoogleName("Ada", "Lovelace", "Ada Lovelace", "ada@example.org"), {
    firstName: "Ada", lastName: "Lovelace"
  });
  assert.deepEqual(splitGoogleName(undefined, undefined, "Ada Lovelace", "ada@example.org"), {
    firstName: "Ada", lastName: "Lovelace"
  });
});
