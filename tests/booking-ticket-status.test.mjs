import assert from "node:assert/strict";
import test from "node:test";
import { bookingTicketStatus } from "../src/lib/booking-ticket-status.ts";

const now = new Date("2026-10-13T12:00:00.000Z");
const future = new Date("2026-10-13T13:00:00.000Z");
const past = new Date("2026-10-13T11:00:00.000Z");

test("an active future booking has a valid QR", () => {
  assert.equal(bookingTicketStatus({ status: "active", endsAt: future }, now), "valid");
  assert.equal(bookingTicketStatus({ status: "active", endsAt: future, matchProposal: { status: "accepted" } }, now), "valid");
});

test("an open proposal does not expose a valid QR", () => {
  assert.equal(bookingTicketStatus({ status: "active", endsAt: future, matchProposal: { status: "open" } }, now), "pending");
  assert.equal(bookingTicketStatus({ status: "active", endsAt: past, matchProposal: { status: "open" } }, now), "expired");
});

test("a cancelled or expired booking cannot be validated with an old screenshot", () => {
  assert.equal(bookingTicketStatus({ status: "cancelled", endsAt: future }, now), "cancelled");
  assert.equal(bookingTicketStatus({ status: "active", endsAt: future, matchProposal: { status: "cancelled" } }, now), "cancelled");
  assert.equal(bookingTicketStatus({ status: "active", endsAt: past }, now), "expired");
});

test("a completed match no longer has a valid QR", () => {
  assert.equal(bookingTicketStatus({ status: "active", endsAt: future, matchProposal: { status: "completed" } }, now), "completed");
});
