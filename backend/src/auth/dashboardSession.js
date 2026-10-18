import crypto from "node:crypto";

const COOKIE_NAME = "eksbase_session";
const DEFAULT_TTL_SECONDS = 8 * 60 * 60;
const sessions = new Map();

function clean(value) {
  return String(value ?? "").trim();
}

function parseCookies(header) {
  const cookies = {};

  for (const part of String(header || "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;

    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    if (name) {
      try {
        cookies[name] = decodeURIComponent(value);
      } catch {
        cookies[name] = value;
      }
    }
  }

  return cookies;
}

function createToken() {
  return crypto.randomBytes(32).toString("hex");
}

function clearExpiredSessions() {
  const now = Date.now();

  for (const [token, session] of sessions.entries()) {
    if (now >= session.expiresAt) {
      sessions.delete(token);
    }
  }
}

export function setDashboardSession(res, user, options = {}) {
  clearExpiredSessions();

  const ttlSeconds = Number(
    options.ttlSeconds || DEFAULT_TTL_SECONDS
  );

  const token = createToken();
  const expiresAt = Date.now() + ttlSeconds * 1000;

  sessions.set(token, {
    provider: clean(user.provider).toLowerCase(),
    providerSubject: clean(user.providerSubject),
    employeeNo: clean(user.employeeNo),
    dingtalkUserId: clean(user.dingtalkUserId),
    displayName: clean(user.displayName),
    avatar: clean(user.avatar),
    createdAt: Date.now(),
    expiresAt,
  });

  const secure = process.env.NODE_ENV === "production";

  const cookieParts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${ttlSeconds}`,
  ];

  if (secure) cookieParts.push("Secure");

  res.setHeader("Set-Cookie", cookieParts.join("; "));
}

export function clearDashboardSession(res) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`
  );
}

export function readDashboardSession(req) {
  clearExpiredSessions();

  const cookies = parseCookies(req.headers.cookie);
  const token = clean(cookies[COOKIE_NAME]);

  if (!token) return null;

  const session = sessions.get(token);
  if (!session) return null;

  if (Date.now() >= session.expiresAt) {
    sessions.delete(token);
    return null;
  }

  return {
    provider: session.provider,
    providerSubject: session.providerSubject,
    employeeNo: session.employeeNo,
    dingtalkUserId: session.dingtalkUserId,
    displayName: session.displayName,
    avatar: session.avatar,
  };
}

/**
 * Loads the server-side session identity into req.authenticatedIdentity.
 * Employee authorization is resolved later by requireAuthenticatedUser.
 */
export function dashboardSessionMiddleware(req, _res, next) {
  const session = readDashboardSession(req);

  if (session) {
    req.authenticatedIdentity = {
      provider: session.provider,
      providerSubject: session.providerSubject,
      employeeNo: session.employeeNo,
    };
  }

  next();
}

export function destroyDashboardSession(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const token = clean(cookies[COOKIE_NAME]);

  if (token) sessions.delete(token);

  clearDashboardSession(res);
}

setInterval(clearExpiredSessions, 15 * 60 * 1000).unref();
