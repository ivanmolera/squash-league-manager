import assert from "node:assert/strict";
import test from "node:test";
import { clubMapUrl } from "../src/lib/club-map.ts";

const club = {
  name: "Club de prueba",
  address: "Carrer Major, 7",
  postalCode: "08001",
  city: "Barcelona",
  province: "Barcelona",
  latitude: 41.38,
  longitude: 2.17
};

test("club map uses stored coordinates instead of an ambiguous name search", () => {
  const url = new URL(clubMapUrl(club));
  assert.equal(url.searchParams.get("q"), "41.38,2.17");
  assert.equal(url.searchParams.get("z"), "16");
});

test("club map falls back to the full address without adding the club name", () => {
  const url = new URL(clubMapUrl({ ...club, latitude: null, longitude: null }));
  assert.equal(url.searchParams.get("q"), "Carrer Major, 7, 08001, Barcelona, Barcelona, España");
});

test("club map ignores invalid coordinates", () => {
  const url = new URL(clubMapUrl({ ...club, latitude: 0, longitude: 0 }));
  assert.match(url.searchParams.get("q"), /Carrer Major/);
});
