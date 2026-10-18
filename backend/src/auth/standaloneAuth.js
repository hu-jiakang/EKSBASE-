import crypto from "node:crypto";
import { getDashboardEmployee } from "./dashboardEmployee.js";
import {
  hasLocalCredential,
  verifyLocalCredential,
  setLocalCredentialPassword,
  getLocalCredentialState,
  markPasswordChanged,
  markLocalCredentialLogin,
  resetLocalCredentialToDefault,
} from "./localCredentials.js";

const sessions = new Map();
const passwordChangeTokens = new Map();

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const PASSWORD_CHANGE_TOKEN_TTL_MS = 10 * 60 * 1000;
import "dotenv/config";

const DEFAULT_ADMIN_PASSWORD = String(process.env.EKSBASE_ADMIN_PASSWORD || "");
const ADMIN_USERNAME = "ADMIN";
const ADMIN_PASSWORD = DEFAULT_ADMIN_PASSWORD;

function clean(value) {
  return String(value ?? "").trim();
}

function logLoginTiming(stage, startedAt, extra = "") {
  const elapsedMs = Math.round(performance.now() - startedAt);
  const suffix = extra ? ` ${extra}` : "";
  console.log(`[AUTH PERF] ${stage} +${elapsedMs}ms${suffix}`);
}

function createPasswordChangeToken(employeeNo) {
  const token = crypto.randomBytes(32).toString("hex");
  passwordChangeTokens.set(token, {
    employeeNo: clean(employeeNo),
    createdAt: Date.now(),
    expiresAt: Date.now() + PASSWORD_CHANGE_TOKEN_TTL_MS,
  });
  return token;
}

function getPasswordChangeSession(token) {
  const normalizedToken = clean(token);
  if (!normalizedToken) return null;

  const record = passwordChangeTokens.get(normalizedToken);
  if (!record) return null;

  if (Date.now() >= record.expiresAt) {
    passwordChangeTokens.delete(normalizedToken);
    return null;
  }

  return record;
}

function createSessionToken(employeeNo, employeeName = "", options = {}) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + SESSION_TTL_MS;

  sessions.set(token, {
    employeeNo: clean(employeeNo),
    employeeName: clean(employeeName),
    isAdmin: options?.isAdmin === true,
    createdAt: Date.now(),
    expiresAt,
  });

  return { token, expiresAt };
}

function isConfiguredAdminCredential(employeeNo, password) {
  return Boolean(
    clean(employeeNo).toUpperCase() === ADMIN_USERNAME &&
      ADMIN_PASSWORD &&
      String(password ?? "") === ADMIN_PASSWORD
  );
}

function createAdminSession() {
  return createSessionToken(
    ADMIN_USERNAME,
    "ADMIN",
    { isAdmin: true }
  );
}

function buildAdminUser() {
  return {
    employeeNo: ADMIN_USERNAME,
    employeeName: "ADMIN",
    role: "ADMIN",
    department: "ADMIN",
    accessLevel: "ADMIN",
    district: "",
    region: "",
    subRegion: "",
    warehouseCode: "",
    salesNo: "",
    isActive: 1,
    organizationCode: "110",
    isAdmin: true,
  };
}

async function resolveActiveEmployee(employeeNo, startedAt = null) {
  const employee = await getDashboardEmployee(employeeNo);

  if (startedAt !== null) {
    logLoginTiming(
      employee
        ? employee.disabled
          ? "Kingdee employee resolved but disabled"
          : "Kingdee employee resolved"
        : "Kingdee employee not found",
      startedAt
    );
  }

  if (!employee || employee.disabled || employee.isActive !== 1) {
    return null;
  }

  if (
    employee.role !== "PROMOTER" &&
    !["ALL", "ADMIN", "DISTRICT", "REGION", "SUB_REGION"].includes(
      employee.accessLevel
    ) &&
    !String(employee.department || "").startsWith("HQ.")
  ) {
    return null;
  }

  return employee;
}

async function createSessionForEmployee(employee, employeeNo) {
  const { token, expiresAt } = createSessionToken(
    employeeNo,
    employee?.employeeName
  );

  return {
    token,
    expiresAt,
    employee,
    requiresPasswordChange: false,
    passwordChangeToken: "",
  };
}

export async function verifyStandalonePassword(employeeNo, password) {
  const normalizedEmployeeNo = clean(employeeNo);
  if (!normalizedEmployeeNo || typeof password !== "string") return false;

  const employee = await resolveActiveEmployee(normalizedEmployeeNo);
  if (!employee) return false;

  const valid = await verifyLocalCredential(normalizedEmployeeNo, password);
  if (valid) await markLocalCredentialLogin(normalizedEmployeeNo);
  return valid;
}

export async function getStandaloneCredentialState(employeeNo) {
  return getLocalCredentialState(employeeNo);
}

export async function changeStandalonePassword(
  passwordChangeToken,
  newPassword
) {
  const pending = getPasswordChangeSession(passwordChangeToken);

  if (!pending) {
    const error = new Error("Password change session is invalid or expired.");
    error.statusCode = 401;
    throw error;
  }

  const normalizedEmployeeNo = pending.employeeNo;
  const employee = await resolveActiveEmployee(normalizedEmployeeNo);

  if (!employee) {
    passwordChangeTokens.delete(passwordChangeToken);
    const error = new Error(
      "Your Kingdee employee account is disabled or no longer has dashboard access."
    );
    error.statusCode = 403;
    throw error;
  }

  const password = String(newPassword ?? "");

  if (password.length < 8) {
    const error = new Error("Password must be at least 8 characters.");
    error.statusCode = 400;
    throw error;
  }

  if (password === normalizedEmployeeNo) {
    const error = new Error(
      "New password cannot remain the Employee No. Please choose a different password."
    );
    error.statusCode = 400;
    throw error;
  }

  await setLocalCredentialPassword(normalizedEmployeeNo, password, {
    mustChangePassword: false,
  });

  passwordChangeTokens.delete(passwordChangeToken);

  return createStandaloneSession(normalizedEmployeeNo, password);
}

export async function resetEmployeePasswordByAdmin(employeeNo) {
  const normalizedEmployeeNo = clean(employeeNo);

  if (!normalizedEmployeeNo) {
    const error = new Error("Employee No. is required.");
    error.statusCode = 400;
    throw error;
  }

  if (normalizedEmployeeNo.toUpperCase() === ADMIN_USERNAME) {
    const error = new Error(
      "The EKSBASE administrator account cannot be reset here."
    );
    error.statusCode = 400;
    throw error;
  }

  const employee = await resolveActiveEmployee(normalizedEmployeeNo);
  if (!employee) {
    const error = new Error(
      "Employee was not found in Kingdee Employee Master, is disabled, or has no dashboard access."
    );
    error.statusCode = 404;
    throw error;
  }

  await resetLocalCredentialToDefault(
    normalizedEmployeeNo,
    normalizedEmployeeNo
  );

  return {
    employee,
    temporaryPassword: normalizedEmployeeNo,
    requiresPasswordChange: true,
  };
}

export async function createStandaloneSession(employeeNo, password) {
  const loginStartedAt = performance.now();
  const normalizedEmployeeNo = clean(employeeNo);

  console.log("[AUTH PERF] Login START");

  if (isConfiguredAdminCredential(normalizedEmployeeNo, password)) {
    const { token, expiresAt } = createAdminSession();
    logLoginTiming("Login COMPLETE (admin)", loginStartedAt);
    return {
      token,
      expiresAt,
      employee: buildAdminUser(),
      requiresPasswordChange: false,
      passwordChangeToken: "",
    };
  }

  if (!normalizedEmployeeNo) {
    const error = new Error("employeeNo is required.");
    error.statusCode = 400;
    throw error;
  }

  const employee = await resolveActiveEmployee(
    normalizedEmployeeNo,
    loginStartedAt
  );

  if (!employee) {
    const error = new Error(
      "Employee was not found in Kingdee Employee Master, is disabled, or has no dashboard access."
    );
    error.statusCode = 403;
    throw error;
  }

  const suppliedPassword = String(password ?? "");
  const credentialStartedAt = performance.now();

  console.log(
    `[AUTH PERF] Local credential lookup START +${Math.round(
      performance.now() - loginStartedAt
    )}ms | employeeNo=${normalizedEmployeeNo}`
  );

  const credentialState = await getLocalCredentialState(normalizedEmployeeNo);
  const credentialExists = Boolean(credentialState);

  console.log(
    `[AUTH PERF] Local credential lookup COMPLETE +${Math.round(
      performance.now() - loginStartedAt
    )}ms | duration=${Math.round(
      performance.now() - credentialStartedAt
    )}ms | exists=${credentialExists}`
  );

  if (!credentialExists) {
    if (suppliedPassword !== normalizedEmployeeNo) {
      const error = new Error(
        "First-time login requires the default password."
      );
      error.statusCode = 401;
      throw error;
    }

    await setLocalCredentialPassword(
      normalizedEmployeeNo,
      normalizedEmployeeNo,
      { mustChangePassword: true }
    );

    return {
      token: "",
      expiresAt: "",
      employee,
      requiresPasswordChange: true,
      passwordChangeToken: createPasswordChangeToken(normalizedEmployeeNo),
    };
  }

  if (Boolean(credentialState?.must_change_password)) {
    const validPassword = await verifyLocalCredential(
      normalizedEmployeeNo,
      suppliedPassword
    );

    if (!validPassword) {
      const error = new Error("Invalid employee number or password.");
      error.statusCode = 401;
      throw error;
    }

    return {
      token: "",
      expiresAt: "",
      employee,
      requiresPasswordChange: true,
      passwordChangeToken: createPasswordChangeToken(normalizedEmployeeNo),
    };
  }

  const validPassword = await verifyLocalCredential(
    normalizedEmployeeNo,
    suppliedPassword
  );

  if (!validPassword) {
    const error = new Error("Invalid employee number or password.");
    error.statusCode = 401;
    throw error;
  }

  await markLocalCredentialLogin(normalizedEmployeeNo);

  return createSessionForEmployee(employee, normalizedEmployeeNo);
}

export async function getStandaloneUser(token) {
  const normalizedToken = clean(token);
  if (!normalizedToken) return null;

  const session = sessions.get(normalizedToken);
  if (!session) return null;

  if (Date.now() >= session.expiresAt) {
    sessions.delete(normalizedToken);
    return null;
  }

  if (session.isAdmin) {
    if (session.employeeNo.toUpperCase() !== ADMIN_USERNAME) {
      sessions.delete(normalizedToken);
      return null;
    }
    return buildAdminUser();
  }

  const employee = await resolveActiveEmployee(session.employeeNo);
  if (!employee) {
    sessions.delete(normalizedToken);
    return null;
  }

  return {
    ...employee,
    employeeName: clean(
      session.employeeName || employee.employeeName || ""
    ),
  };
}

export async function restoreRememberedSession() {
  return null;
}

export async function destroyStandaloneSession(token) {
  const normalizedToken = clean(token);
  if (!normalizedToken) return false;

  return sessions.delete(normalizedToken);
}

export function clearExpiredStandaloneSessions() {
  const now = Date.now();

  for (const [token, session] of sessions.entries()) {
    if (now >= session.expiresAt) sessions.delete(token);
  }

  for (const [token, pending] of passwordChangeTokens.entries()) {
    if (now >= pending.expiresAt) passwordChangeTokens.delete(token);
  }
}

setInterval(clearExpiredStandaloneSessions, 15 * 60 * 1000).unref();
