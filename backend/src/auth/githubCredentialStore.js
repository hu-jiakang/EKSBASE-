import crypto from "node:crypto";

const API_BASE = "https://api.github.com";
const DEFAULT_REPO = "emmanendayarealmeph-cpu/eksbase-private-credentials";
const DEFAULT_PATH = "data/standalone-credentials.json";
const CACHE_TTL_MS = 5000;
const MAX_UPDATE_ATTEMPTS = 3;

let cache = null;
let cacheLoadedAt = 0;
let cacheSha = "";

function clean(value) {
  return String(value ?? "").trim();
}

function getConfig() {
  const token = clean(process.env.GITHUB_CREDENTIALS_TOKEN);
  const repo = clean(process.env.GITHUB_CREDENTIALS_REPO) || DEFAULT_REPO;
  const path = clean(process.env.GITHUB_CREDENTIALS_PATH) || DEFAULT_PATH;

  if (!token) {
    throw new Error("GITHUB_CREDENTIALS_TOKEN is not configured.");
  }

  if (!repo.includes("/")) {
    throw new Error("GITHUB_CREDENTIALS_REPO must be in owner/repository format.");
  }

  return { token, repo, path };
}

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "EKSBASE-Render-Auth",
  };
}

function apiUrl(repo, path) {
  return `${API_BASE}/repos/${repo}/contents/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

function normalizeStore(value) {
  const source = value && typeof value === "object" ? value : {};
  const credentials =
    source.credentials && typeof source.credentials === "object"
      ? source.credentials
      : {};

  return {
    version: Number(source.version || 1),
    credentials,
  };
}

async function githubRequest(url, options = {}) {
  const { token } = getConfig();

  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers(token),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json();
      detail = body?.message ? `: ${body.message}` : "";
    } catch {
      // Ignore non-JSON error bodies.
    }

    const error = new Error(
      `GitHub credential store request failed (${response.status})${detail}`
    );
    error.statusCode = response.status;
    throw error;
  }

  return response;
}

async function readStoreFromGitHub() {
  const { repo, path } = getConfig();
  const response = await githubRequest(apiUrl(repo, path));
  const payload = await response.json();

  if (!payload?.content) {
    throw new Error("GitHub credential store file has no content.");
  }

  const encoded = String(payload.content).replace(/\s/g, "");
  const text = Buffer.from(encoded, "base64").toString("utf8");

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("GitHub credential store contains invalid JSON.");
  }

  cache = normalizeStore(parsed);
  cacheSha = clean(payload.sha);
  cacheLoadedAt = Date.now();

  return {
    store: cache,
    sha: cacheSha,
  };
}

async function getStore({ force = false } = {}) {
  if (!force && cache && Date.now() - cacheLoadedAt < CACHE_TTL_MS) {
    return { store: cache, sha: cacheSha };
  }

  return readStoreFromGitHub();
}

async function writeStoreToGitHub(store, expectedSha, message) {
  const { repo, path } = getConfig();

  const content = Buffer.from(
    JSON.stringify(normalizeStore(store), null, 2) + "\n",
    "utf8"
  ).toString("base64");

  const response = await githubRequest(apiUrl(repo, path), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      content,
      sha: expectedSha,
      branch: "main",
    }),
  });

  const payload = await response.json();

  cache = normalizeStore(store);
  cacheSha = clean(payload?.content?.sha || payload?.commit?.sha || "");
  cacheLoadedAt = Date.now();

  return cache;
}

async function updateStore(mutator, message) {
  let lastError;

  for (let attempt = 0; attempt < MAX_UPDATE_ATTEMPTS; attempt += 1) {
    try {
      const { store, sha } = await getStore({ force: true });
      const nextStore = normalizeStore(
        await mutator(JSON.parse(JSON.stringify(store)))
      );

      return await writeStoreToGitHub(nextStore, sha, message);
    } catch (error) {
      lastError = error;

      // A stale SHA can occur when two Render requests update credentials
      // concurrently. Refresh and retry instead of overwriting another update.
      if (![409, 422].includes(Number(error?.statusCode))) {
        throw error;
      }
    }
  }

  throw lastError || new Error("Unable to update GitHub credential store.");
}

export async function getCredentialRecord(employeeNo) {
  const normalizedEmployeeNo = clean(employeeNo);
  if (!normalizedEmployeeNo) return null;

  const { store } = await getStore();
  const key = Object.keys(store.credentials).find(
    (candidate) =>
      String(candidate).trim().toUpperCase() === normalizedEmployeeNo.toUpperCase()
  );

  if (!key) return null;

  return {
    employeeNo: key,
    ...store.credentials[key],
  };
}

export async function setCredentialRecord(employeeNo, record) {
  const normalizedEmployeeNo = clean(employeeNo);
  if (!normalizedEmployeeNo) {
    throw new Error("employeeNo is required.");
  }

  await updateStore(
    (store) => {
      const existingKey = Object.keys(store.credentials).find(
        (candidate) =>
          String(candidate).trim().toUpperCase() ===
          normalizedEmployeeNo.toUpperCase()
      );
      const key = existingKey || normalizedEmployeeNo;

      store.credentials[key] = {
        passwordHash: String(record?.passwordHash || ""),
        isActive: record?.isActive === false ? 0 : 1,
        createdAt:
          String(record?.createdAt || "") || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastLoginAt: String(record?.lastLoginAt || ""),
        mustChangePassword: Boolean(record?.mustChangePassword),
      };

      return store;
    },
    `EKSBASE: update standalone credential ${normalizedEmployeeNo}`
  );
}

export async function deleteCredentialRecord(employeeNo) {
  const normalizedEmployeeNo = clean(employeeNo);
  if (!normalizedEmployeeNo) return;

  await updateStore(
    (store) => {
      for (const key of Object.keys(store.credentials)) {
        if (
          String(key).trim().toUpperCase() ===
          normalizedEmployeeNo.toUpperCase()
        ) {
          delete store.credentials[key];
        }
      }
      return store;
    },
    `EKSBASE: remove standalone credential ${normalizedEmployeeNo}`
  );
}

export async function updateCredentialRecord(employeeNo, updater, message) {
  const normalizedEmployeeNo = clean(employeeNo);
  if (!normalizedEmployeeNo) {
    throw new Error("employeeNo is required.");
  }

  await updateStore(
    (store) => {
      const existingKey = Object.keys(store.credentials).find(
        (candidate) =>
          String(candidate).trim().toUpperCase() ===
          normalizedEmployeeNo.toUpperCase()
      );

      if (!existingKey) {
        throw new Error("Standalone credential does not exist.");
      }

      const current = store.credentials[existingKey] || {};
      store.credentials[existingKey] = {
        ...current,
        ...(updater(current) || {}),
        updatedAt: new Date().toISOString(),
      };

      return store;
    },
    message || `EKSBASE: update standalone credential ${normalizedEmployeeNo}`
  );
}

export function hashPassword(password) {
  if (typeof password !== "string") {
    throw new Error("password is required.");
  }

  const salt = crypto.randomBytes(16);
  const derivedKey = crypto.scryptSync(password, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 32 * 1024 * 1024,
  });

  return [
    "scrypt",
    16384,
    8,
    1,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

export function verifyPassword(password, encodedHash) {
  if (typeof password !== "string" || !encodedHash) return false;

  const parts = String(encodedHash).split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, nRaw, rRaw, pRaw, saltRaw, keyRaw] = parts;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);

  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false;
  }

  try {
    const salt = Buffer.from(saltRaw, "base64url");
    const expected = Buffer.from(keyRaw, "base64url");
    const actual = crypto.scryptSync(password, salt, expected.length, {
      N,
      r,
      p,
      maxmem: 32 * 1024 * 1024,
    });

    return (
      actual.length === expected.length &&
      crypto.timingSafeEqual(actual, expected)
    );
  } catch {
    return false;
  }
}
