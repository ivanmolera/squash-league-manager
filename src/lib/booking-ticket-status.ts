type ReservationForTicket = {
  status: "active" | "cancelled";
  endsAt: Date;
  matchProposal?: { status: "open" | "accepted" | "cancelled" | "completed" } | null;
};

export type BookingTicketStatus = "valid" | "cancelled" | "expired" | "pending" | "completed";

export function bookingTicketStatus(reservation: ReservationForTicket, now = new Date()): BookingTicketStatus {
  if (reservation.status === "cancelled" || reservation.matchProposal?.status === "cancelled") return "cancelled";
  if (reservation.matchProposal?.status === "completed") return "completed";
  if (reservation.endsAt <= now) return "expired";
  if (reservation.matchProposal?.status === "open") return "pending";
  return "valid";
}
