import assert from "node:assert/strict";
import test from "node:test";
import { localizeCategoryName } from "../src/lib/category-names.ts";

test("canonical competition categories follow the selected language", () => {
  assert.equal(localizeCategoryName("Segunda", "ca"), "Segona");
  assert.equal(localizeCategoryName("Segunda", "es"), "Segunda");
  assert.equal(localizeCategoryName("Segunda", "en"), "Second division");
  assert.equal(localizeCategoryName("Femenina", "en"), "Women's");
});

test("age-category names retain their category number", () => {
  assert.equal(localizeCategoryName("Masc Sub-15", "ca"), "Masc Sub-15");
  assert.equal(localizeCategoryName("Masc Sub-15", "en"), "Men U15");
  assert.equal(localizeCategoryName("Fem +35", "en"), "Women +35");
  assert.equal(localizeCategoryName("Unknown", "ca"), "Unknown");
});
