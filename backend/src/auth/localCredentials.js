import { authDb } from "../database/authDatabase.js";
import crypto from "node:crypto";

const MIN_PASSWORD_LENGTH = 8;

function clean(value) {
  return String(value ?? "").trim();
}

function assertPassword(password) {
  if (typeof password !== "string") {
    throw new Error("password is required.");
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
    );
  }
}

export async function getCredentialRecord(employeeNo) {
  const normalizedEmployeeNo = clean(employeeNo);
  if (!normalizedEmployeeNo) return null;

  const record = authDb
    .prepare(`
      SELECT
        employee_no AS employeeNo,
        password_hash AS passwordHash,
        is_active AS isActive,
        created_at AS createdAt,
        updated_at AS updatedAt,
        last_login_at AS lastLoginAt,
        must_change_password AS mustChangePassword
      FROM standalone_credentials
      WHERE employee_no = ?
      COLLATE NOCASE
      LIMIT 1
    `)
    .get(normalizedEmployeeNo);

  return record || null;
}

export async function hasLocalCredential(employeeNo) {
  const record = await getCredentialRecord(employeeNo);
  return Boolean(record?.passwordHash && record?.isActive !== 0);
}

export async function setLocalCredentialPassword(
  employeeNo,
  password,
  options = {}
) {
  const normalizedEmployeeNo = clean(employeeNo);
  if (!normalizedEmployeeNo) {
    throw new Error("employeeNo is required.");
  }

  assertPassword(password);

  const existing = await getCredentialRecord(normalizedEmployeeNo);
  const now = new Date().toISOString();

  authDb
    .prepare(`
      INSERT INTO standalone_credentials (
        employee_no,
        password_hash,
        is_active,
        created_at,
        updated_at,
        last_login_at,
        must_change_password
      )
      VALUES (?, ?, 1, ?, ?, ?, ?)
      ON CONFLICT(employee_no) DO UPDATE SET
        password_hash = excluded.password_hash,
        is_active = 1,
        updated_at = excluded.updated_at,
        must_change_password = excluded.must_change_password
    `)
    .run(
      normalizedEmployeeNo,
      hashPassword(password),
      existing?.createdAt || now,
      now,
      existing?.lastLoginAt || "",
      options?.mustChangePassword ? 1 : 0
    );
}

export async function getLocalCredentialState(employeeNo) {
  const normalizedEmployeeNo = clean(employeeNo);
  if (!normalizedEmployeeNo) return null;

  const record = await getCredentialRecord(normalizedEmployeeNo);
  if (!record || record.isActive === 0) return null;

  return {
    employee_no: record.employeeNo || normalizedEmployeeNo,
    is_active: record.isActive === 0 ? 0 : 1,
    must_change_password: Boolean(record.mustChangePassword),
  };
}

export async function markPasswordChanged(employeeNo) {
  const normalizedEmployeeNo = clean(employeeNo);
  if (!normalizedEmployeeNo) return;

  const result = authDb
    .prepare(`
      UPDATE standalone_credentials
      SET must_change_password = 0,
          updated_at = ?
      WHERE employee_no = ? COLLATE NOCASE
    `)
    .run(new Date().toISOString(), normalizedEmployeeNo);

  if (Number(result.changes) === 0) {
    throw new Error("Standalone credential does not exist.");
  }
}

export async function verifyLocalCredential(employeeNo, password) {
  const normalizedEmployeeNo = clean(employeeNo);
  if (!normalizedEmployeeNo || typeof password !== "string") {
    return false;
  }

  const record = await getCredentialRecord(normalizedEmployeeNo);
  if (!record || record.isActive === 0) return false;

  return verifyPassword(password, record.passwordHash);
}

export async function markLocalCredentialLogin(employeeNo) {
  const normalizedEmployeeNo = clean(employeeNo);
  if (!normalizedEmployeeNo) return;

  authDb
    .prepare(`
      UPDATE standalone_credentials
      SET last_login_at = ?,
          updated_at = ?
      WHERE employee_no = ? COLLATE NOCASE
    `)
    .run(
      new Date().toISOString(),
      new Date().toISOString(),
      normalizedEmployeeNo
    );
}

export async function resetLocalCredentialToDefault(
  employeeNo,
  defaultPassword
) {
  const normalizedEmployeeNo = clean(employeeNo);
  if (!normalizedEmployeeNo) {
    throw new Error("employeeNo is required.");
  }

  const password = String(defaultPassword ?? "");
  if (!password) {
    throw new Error("defaultPassword is required.");
  }

  await setLocalCredentialPassword(normalizedEmployeeNo, password, {
    mustChangePassword: true,
  });
}

export async function disableLocalCredential(employeeNo) {
  const normalizedEmployeeNo = clean(employeeNo);
  if (!normalizedEmployeeNo) return;

  authDb
    .prepare(`
      UPDATE standalone_credentials
      SET is_active = 0,
          updated_at = ?
      WHERE employee_no = ? COLLATE NOCASE
    `)
    .run(new Date().toISOString(), normalizedEmployeeNo);
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
