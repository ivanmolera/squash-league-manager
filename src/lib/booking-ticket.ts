import "server-only";

import QRCode from "qrcode";
import { formatCourtBookingDay, formatCourtBookingTime } from "@/src/lib/court-booking-time";
import { appBaseUrl, sendTransactionalEmail } from "@/src/lib/email";
import type { Dictionary, Locale } from "@/src/lib/i18n";

export function bookingTicketUrl(reservationId: string) {
  return `${appBaseUrl()}/bookings/${reservationId}`;
}

const qrOptions = { errorCorrectionLevel: "M" as const, margin: 3, width: 256 };

export function bookingTicketQrDataUrl(reservationId: string) {
  return QRCode.toDataURL(bookingTicketUrl(reservationId), qrOptions);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character] ?? character);
}

export async function sendBookingTicketEmail({
  reservationId,
  clubName,
  courtNumber,
  startsAt,
  endsAt,
  email,
  locale,
  t
}: {
  reservationId: string;
  clubName: string;
  courtNumber: number;
  startsAt: Date;
  endsAt: Date;
  email: string;
  locale: Locale;
  t: Dictionary;
}) {
  const url = bookingTicketUrl(reservationId);
  const day = formatCourtBookingDay(startsAt, locale);
  const time = `${formatCourtBookingTime(startsAt)}-${formatCourtBookingTime(endsAt)}`;
  const details = `${clubName} · ${t.court} ${courtNumber} · ${day} · ${time}`;
  const qr = await QRCode.toBuffer(url, qrOptions);

  return sendTransactionalEmail({
    to: email,
    subject: t.bookingTicketEmailSubject,
    text: `${t.bookingTicketEmailIntro}\n\n${details}\n\n${t.bookingTicket}: ${url}`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#172b29"><h1>${escapeHtml(t.bookingTicket)}</h1><p>${escapeHtml(t.bookingTicketEmailIntro)}</p><p><strong>${escapeHtml(details)}</strong></p><p><img src="cid:booking-ticket-qr" alt="${escapeHtml(t.bookingQrLabel)}" width="256" height="256"></p><p><a href="${escapeHtml(url)}">${escapeHtml(t.openBookingTicket)}</a></p></div>`,
    attachments: [{ filename: "reserva-squashflow.png", content: qr.toString("base64"), contentId: "booking-ticket-qr", contentType: "image/png" }]
  });
}
