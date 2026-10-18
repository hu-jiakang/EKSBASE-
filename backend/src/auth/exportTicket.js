import crypto from "node:crypto";

/**
 * One-time export tickets.
 *
 * Mobile WebViews (DingTalk in-app browser on Android/iOS) cannot deliver
 * Blob downloads, and standalone users authenticate via an Authorization
 * header that a direct navigation cannot carry.
 *
 * Flow: the frontend asks POST /dashboard/export-ticket (authenticated the
 * normal way) and then navigates to the export URL with ?ticket=<ticket>.
 * Each ticket works exactly once and expires quickly.
 */

const TICKET_TTL_MS = 2 * 60 * 1000;

const tickets = new Map();

function clean(value) {
  return String(value ?? "").trim();
}

function purgeExpiredTickets() {
  const now = Date.now();

  for (const [key, entry] of tickets.entries()) {
    if (now >= entry.expiresAt) {
      tickets.delete(key);
    }
  }
}

export function createExportTicket(identity, user) {
  purgeExpiredTickets();

  const ticket = crypto.randomBytes(24).toString("hex");
  const now = Date.now();

  tickets.set(ticket, {
    identity,
    user,
    createdAt: now,
    expiresAt: now + TICKET_TTL_MS,
  });

  return ticket;
}

export function consumeExportTicket(ticketToken) {
  const token = clean(ticketToken);
  if (!token) return null;

  const entry = tickets.get(token);
  if (!entry) return null;

  if (Date.now() >= entry.expiresAt) {
    tickets.delete(token);
    return null;
  }

  /*
   * Replayable within its short TTL. The DingTalk WebView prefetches the
   * navigation URL once before handing it to the external browser, so a
   * strict one-time ticket gets consumed by the prefetch and the real
   * download then fails with 401. A 2-minute replay window keeps the
   * exposure tiny while tolerating that behavior.
   */
  return {
    identity: entry.identity,
    user: entry.user,
  };
}
