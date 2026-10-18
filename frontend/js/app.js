const API_BASE_URL = "/api";
const AUTH_TOKEN_KEY = "eksbase.auth.token";
const AUTH_USER_KEY = "eksbase.auth.user";

// DingTalk SSO configuration.
// Replace these placeholders with the real DingTalk application values
// after the DingTalk application is configured. Never put the Client Secret
// in frontend code.
let DINGTALK_CLIENT_ID = "";
let DINGTALK_CORP_ID = "";
let DINGTALK_AGENT_ID = "";

const loginScreenEl = document.getElementById("loginScreen");
const appShellEl = document.getElementById("appShell");
const passwordChangeScreenEl = document.getElementById("passwordChangeScreen");
const passwordChangeFormEl = document.getElementById("passwordChangeForm");
const newPasswordEl = document.getElementById("newPassword");
const confirmPasswordEl = document.getElementById("confirmPassword");
const passwordChangeButtonEl = document.getElementById("passwordChangeButton");
const passwordChangeMessageEl = document.getElementById("passwordChangeMessage");
const loginFormEl = document.getElementById("loginForm");
const loginEmployeeNoEl = document.getElementById("loginEmployeeNo");
const loginPasswordEl = document.getElementById("loginPassword");
const loginButtonEl = document.getElementById("loginButton");
const loginMessageEl = document.getElementById("loginMessage");
const dingtalkLoginMessageEl = document.getElementById("dingtalkLoginMessage");
const logoutButtonEl = document.getElementById("logoutButton");
const adminButtonEl = document.getElementById("adminButton");
const adminResetModalEl = document.getElementById("adminResetModal");
const adminResetEmployeeNoEl = document.getElementById("adminResetEmployeeNo");
const adminResetButtonEl = document.getElementById("adminResetButton");
const adminResetMessageEl = document.getElementById("adminResetMessage");


async function loadDingTalkConfig() {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/dingtalk/config`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`DingTalk configuration request failed (${response.status}).`);
    }

    const payload = await response.json();

    DINGTALK_CLIENT_ID = String(payload?.clientId || "").trim();
    DINGTALK_CORP_ID = String(payload?.corpId || "").trim();
    DINGTALK_AGENT_ID = String(payload?.agentId || "").trim();

    return Boolean(DINGTALK_CLIENT_ID && DINGTALK_CORP_ID);
  } catch (error) {
    console.error("[DINGTALK] Unable to load configuration:", error);
    DINGTALK_CLIENT_ID = "";
    DINGTALK_CORP_ID = "";
    DINGTALK_AGENT_ID = "";
    return false;
  }
}

function getStoredAuthToken() {
  // Standalone authentication is session-based. Ignore any legacy persistent
  // authentication token from localStorage.
  localStorage.removeItem(AUTH_TOKEN_KEY);
  return sessionStorage.getItem(AUTH_TOKEN_KEY) || "";
}

let authToken = getStoredAuthToken();
let authenticatedUser = null;
let passwordChangeToken = "";
let isDingTalkSession = false;
let dingTalkLoginInProgress = false;



function isDingTalkEnvironment() {
  /*
   * IMPORTANT AUTHENTICATION RULE:
   *
   * Do not use window.dd alone as a DingTalk detector.
   * The DingTalk JSAPI library is loaded by EKSBASE and can expose window.dd
   * even when EKSBASE is opened in normal Chrome/Edge.
   *
   * Prefer DingTalk's runtime environment information when available.
   * In the DingTalk desktop container the JSAPI runtime identifies the
   * platform as PC/Mac, while a normal browser does not expose the same
   * DingTalk runtime environment.
   *
   * Fallback to the User-Agent for clients that explicitly identify as
   * DingTalk.
   */
  const userAgent = String(navigator.userAgent || "");
  const vendor = String(navigator.vendor || "");
  const dd = window.dd;

  if (/DingTalk/i.test(userAgent) || /DingTalk/i.test(vendor)) {
    return true;
  }

  const platform = String(dd?.env?.platform || "")
    .trim()
    .toLowerCase();

  if (platform === "pc" || platform === "mac" || platform === "windows") {
    return true;
  }

  return false;
}

function getDingTalkCorpId() {
  const params = new URLSearchParams(window.location.search);
  return (
    params.get("corpid") ||
    params.get("corpId") ||
    DINGTALK_CORP_ID
  ).trim();
}

function setDingTalkLoginMessage(message = "", isError = true) {
  if (!dingtalkLoginMessageEl) return;
  dingtalkLoginMessageEl.textContent = message;
  dingtalkLoginMessageEl.classList.toggle("error", Boolean(message && isError));
  dingtalkLoginMessageEl.classList.toggle("success", Boolean(message && !isError));
}

function isDingTalkConfigured() {
  return Boolean(
    DINGTALK_CLIENT_ID &&
    DINGTALK_CORP_ID &&
    !DINGTALK_CLIENT_ID.startsWith("YOUR_") &&
    !DINGTALK_CORP_ID.startsWith("YOUR_")
  );
}

function requestDingTalkAuthCode() {
  return new Promise((resolve, reject) => {
    const dd = window.dd;

    if (!dd) {
      reject(
        new Error(
          "DingTalk JSAPI is not available. Please reopen EKSBASE from the DingTalk Workbench."
        )
      );
      return;
    }

    const corpId = getDingTalkCorpId();

    if (
      !DINGTALK_CLIENT_ID ||
      DINGTALK_CLIENT_ID.startsWith("YOUR_") ||
      DINGTALK_CLIENT_ID === "placeholder"
    ) {
      reject(new Error("DingTalk Client ID is not configured yet."));
      return;
    }

    if (
      !corpId ||
      corpId.startsWith("YOUR_") ||
      corpId === "placeholder"
    ) {
      reject(new Error("DingTalk Corp ID is not configured yet."));
      return;
    }

    /*
     * Use DingTalk's documented H5 requestAuthCode API first.
     * Current containers expose dd.requestAuthCode(...).
     * Older containers may expose dd.runtime.permission.requestAuthCode(...).
     */
    const authFn =
      typeof dd.requestAuthCode === "function"
        ? dd.requestAuthCode
        : dd.runtime?.permission?.requestAuthCode;

    const authContext =
      typeof dd.requestAuthCode === "function"
        ? dd
        : dd.runtime?.permission;

    if (typeof authFn !== "function" || !authContext) {
      reject(
        new Error(
          "DingTalk requestAuthCode API is not available. Please reopen EKSBASE from the DingTalk Workbench."
        )
      );
      return;
    }

    let settled = false;

    const done = (result) => {
      if (settled) return;

      const code = String(
        result?.code ||
        result?.authCode ||
        ""
      ).trim();

      if (!code) {
        settled = true;
        reject(new Error("DingTalk did not return an authorization code."));
        return;
      }

      settled = true;
      resolve(code);
    };

    const failed = (error) => {
      if (settled) return;

      settled = true;
      console.error("[DINGTALK SSO] requestAuthCode failed", error);

      const errorCode = String(
        error?.code ||
        error?.errorCode ||
        ""
      ).trim();

      const errorMessage = String(
        error?.message ||
        error?.errmsg ||
        error?.errorMessage ||
        ""
      ).trim();

      const detail = [errorCode, errorMessage]
        .filter(Boolean)
        .join(": ");

      reject(
        new Error(
          detail
            ? `Unable to obtain DingTalk authorization (${detail}).`
            : "Unable to obtain DingTalk authorization. Please try again."
        )
      );
    };

    const start = () => {
      try {
        const request = {
          clientId: DINGTALK_CLIENT_ID,
          corpId,
          onSuccess: done,
          success: done,
          onFail: failed,
          fail: failed,
          complete: () => {},
        };

        const result = authFn.call(authContext, request);

        if (result && typeof result.then === "function") {
          result.then(done).catch(failed);
        }
      } catch (error) {
        failed(error);
      }
    };

    if (typeof dd.ready === "function") {
      dd.ready(start);
    } else {
      start();
    }

    if (typeof dd.error === "function") {
      dd.error((error) => {
        console.error("[DINGTALK SSO] dd.error", error);
      });
    }
  });
}
async function authenticateWithDingTalk() {
  if (dingTalkLoginInProgress) return;

  dingTalkLoginInProgress = true;
  setDingTalkLoginMessage("Signing in with DingTalk...", false);

  try {
    const authCode = await requestDingTalkAuthCode();

    const response = await fetch(`${API_BASE_URL}/auth/dingtalk/login`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ authCode }),
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      throw new Error(
        payload?.message ||
        `DingTalk login failed (${response.status}).`
      );
    }

    const meResponse = await fetch(`${API_BASE_URL}/auth/dingtalk/me`, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
      },
    });

    let mePayload = null;
    try {
      mePayload = await meResponse.json();
    } catch {
      mePayload = null;
    }

    if (!meResponse.ok || !mePayload?.user) {
      throw new Error(
        mePayload?.message ||
        `DingTalk session could not be established (${meResponse.status}).`
      );
    }

    clearStoredAuth();
    isDingTalkSession = true;
    authenticatedUser = mePayload.user;
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(authenticatedUser));

    setDingTalkLoginMessage("DingTalk login successful.", false);
    setAuthenticatedUi(true);
    loadDashboard();
  } catch (error) {
    isDingTalkSession = false;
    setDingTalkLoginMessage(error?.message || "Unable to sign in with DingTalk.");
    setAuthenticatedUi(false);
  } finally {
    dingTalkLoginInProgress = false;
  }
}

async function validateDingTalkSession() {
  if (!isDingTalkEnvironment()) return false;

  try {
    const response = await fetch(`${API_BASE_URL}/auth/dingtalk/me`, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) return false;

    const payload = await response.json();
    if (!payload?.user) return false;

    authenticatedUser = payload.user;
    isDingTalkSession = true;
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(authenticatedUser));
    return true;
  } catch {
    return false;
  }
}

// Password visibility toggles. Keep this isolated from authentication logic.
function setupPasswordToggle(buttonId, inputId, label) {
  const button = document.getElementById(buttonId);
  const input = document.getElementById(inputId);
  if (!button || !input) return;

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    const isPassword = input.type === "password";
    input.type = isPassword ? "text" : "password";
    button.setAttribute("aria-pressed", String(isPassword));
    button.setAttribute("aria-label", `${isPassword ? "Hide" : "Show"} ${label}`);
    button.setAttribute("title", `${isPassword ? "Hide" : "Show"} ${label}`);

    button.innerHTML = isPassword ? `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <path d="M3 3l18 18"></path>
  <path d="M10.6 6.2A10.7 10.7 0 0 1 12 6c6 0 9.5 6 9.5 6a16.7 16.7 0 0 1-3.2 3.9"></path>
  <path d="M6.1 6.9C3.7 8.6 2.5 12 2.5 12S6 18 12 18a9.8 9.8 0 0 0 4-.8"></path>
  <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"></path>
</svg>
` : `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path>
  <circle cx="12" cy="12" r="2.5"></circle>
</svg>
`;
  });
}

setupPasswordToggle("toggleLoginPassword", "loginPassword", "password");
setupPasswordToggle("toggleNewPassword", "newPassword", "new password");
setupPasswordToggle("toggleConfirmPassword", "confirmPassword", "confirm password");

function setAuthenticatedUi(isAuthenticated) {
  loginScreenEl?.classList.toggle("hidden", isAuthenticated);
  passwordChangeScreenEl?.classList.add("hidden");
  appShellEl?.classList.toggle("hidden", !isAuthenticated);
  const isAdmin = isAuthenticated && authenticatedUser?.isAdmin === true;
  adminButtonEl?.classList.toggle("hidden", !isAdmin);
}

function showPasswordChangeUi(token, user) {
  passwordChangeToken = String(token || "");
  authenticatedUser = user || null;
  loginScreenEl?.classList.add("hidden");
  appShellEl?.classList.add("hidden");

  if (!passwordChangeScreenEl) {
    setLoginMessage("First-time login requires password setup. Please refresh the page and try again.");
    loginScreenEl?.classList.remove("hidden");
    return;
  }

  passwordChangeScreenEl.classList.remove("hidden");
  setPasswordChangeMessage("Please choose a new password to continue.", false);
  newPasswordEl?.focus();
}

function setPasswordChangeMessage(message = "", isError = true) {
  if (!passwordChangeMessageEl) return;
  passwordChangeMessageEl.textContent = message;
  passwordChangeMessageEl.classList.toggle("error", Boolean(message && isError));
  passwordChangeMessageEl.classList.toggle("success", Boolean(message && !isError));
}

function setLoginMessage(message = "", isError = true) {
  if (!loginMessageEl) return;
  loginMessageEl.textContent = message;
  loginMessageEl.classList.toggle("error", Boolean(message && isError));
  loginMessageEl.classList.toggle("success", Boolean(message && !isError));
}

function clearStoredAuth() {
  authToken = "";
  authenticatedUser = null;
  passwordChangeToken = "";
  isDingTalkSession = false;
  localStorage.removeItem(AUTH_TOKEN_KEY);
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

function saveAuth(result) {
  authToken = String(result?.token || "");
  authenticatedUser = result?.user || null;

  localStorage.removeItem(AUTH_TOKEN_KEY);
  sessionStorage.removeItem(AUTH_TOKEN_KEY);

  if (authToken) {
    sessionStorage.setItem(AUTH_TOKEN_KEY, authToken);
  }

  if (authenticatedUser) {
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(authenticatedUser));
  }
}

function restoreCachedUser() {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    authenticatedUser = raw ? JSON.parse(raw) : null;
  } catch {
    authenticatedUser = null;
  }
}

async function authenticate(employeeNo, password) {
  const response = await fetch(`${API_BASE_URL}/auth/standalone/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employeeNo, password }),
  });

  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }

  if (!response.ok) {
    throw new Error(payload?.message || `Login failed (${response.status}).`);
  }

  if (payload?.requiresPasswordChange) return payload;

  if (!payload?.token) {
    throw new Error("Login succeeded but no session token was returned.");
  }

  saveAuth(payload);
  return payload;
}

async function validateExistingSession() {
  if (!authToken) return false;

  try {
    let response = await fetch(`${API_BASE_URL}/auth/standalone/me`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    if (response.ok) {
      const payload = await response.json();
      authenticatedUser = payload?.user || authenticatedUser;
      if (authenticatedUser) {
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(authenticatedUser));
      }
      return true;
    }

    clearStoredAuth();
    return false;
  } catch {
    return true;
  }
}

async function handleLogout() {
  const wasDingTalkSession = isDingTalkSession;

  try {
    if (wasDingTalkSession) {
      await fetch(`${API_BASE_URL}/auth/dingtalk/logout`, {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
    } else if (authToken) {
      await fetch(`${API_BASE_URL}/auth/standalone/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
      });
    }
  } catch (error) {
    console.warn("Logout request failed", error);
  } finally {
    clearStoredAuth();
    setAuthenticatedUi(false);
    setLoginMessage("");
    loginFormEl?.reset();
    loginEmployeeNoEl?.focus();
  }
}

async function initializeAuthentication() {
  restoreCachedUser();
  await loadDingTalkConfig();

  const inDingTalk = isDingTalkEnvironment();

  console.log("[DINGTALK] Environment detected:", inDingTalk);

  /*
   * IMPORTANT:
   * When EKSBASE is opened inside DingTalk, do not display the
   * standalone Employee No. + Password login screen.
   *
   * DingTalk authentication must happen automatically.
   */
  if (inDingTalk) {
    loginScreenEl?.classList.add("hidden");
    passwordChangeScreenEl?.classList.add("hidden");
    appShellEl?.classList.add("hidden");

    if (dingtalkLoginMessageEl) {
      dingtalkLoginMessageEl.textContent =
        "Signing in with DingTalk...";
      dingtalkLoginMessageEl.classList.remove("error");
    }

    /*
     * If DingTalk already has a valid EKSBASE session cookie,
     * go directly to the dashboard.
     */
    const validDingTalkSession = await validateDingTalkSession();

    if (validDingTalkSession) {
      setAuthenticatedUi(true);
      loadDashboard();
      return;
    }

    /*
     * No existing session — automatically perform DingTalk SSO.
     */
    if (isDingTalkConfigured()) {
      try {
        await authenticateWithDingTalk();
      } catch (error) {
        console.error(
          "[DINGTALK SSO] Automatic authentication failed:",
          error
        );

        /*
         * Do NOT fall back to standalone login inside DingTalk.
         * Authentication must remain DingTalk SSO.
         */
        loginScreenEl?.classList.add("hidden");
        appShellEl?.classList.add("hidden");

        if (dingtalkLoginMessageEl) {
          dingtalkLoginMessageEl.textContent =
            error?.message ||
            "Unable to sign in with DingTalk.";
          dingtalkLoginMessageEl.classList.add("error");
        }
      }

      return;
    }

    /*
     * DingTalk detected but SSO is not configured.
     * Keep the standalone login hidden.
     */
    if (dingtalkLoginMessageEl) {
      dingtalkLoginMessageEl.textContent =
        "DingTalk SSO is not configured.";
      dingtalkLoginMessageEl.classList.add("error");
    }

    return;
  }

  /*
   * Normal browser / direct URL:
   * standalone Employee No. + Password authentication only.
   */
  setAuthenticatedUi(false);

  const validSession = await validateExistingSession();

  if (validSession) {
    setAuthenticatedUi(true);
    loadDashboard();
    return;
  }

  loginEmployeeNoEl?.focus();
}

loginFormEl?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const employeeNo = loginEmployeeNoEl.value.trim();
  const password = loginPasswordEl.value;

  if (!employeeNo || !password) {
    setLoginMessage("Please enter your Employee No. and password.");
    return;
  }


  loginButtonEl.disabled = true;
  setLoginMessage("Signing in...", false);

  try {
    const result = await authenticate(employeeNo, password);
    loginPasswordEl.value = "";

    if (result?.requiresPasswordChange) {
      showPasswordChangeUi(
        result.passwordChangeToken,
        result.user
      );
      return;
    }

    setLoginMessage("Login successful.", false);
    setAuthenticatedUi(true);
    loadDashboard();
  } catch (error) {
    clearStoredAuth();
    setLoginMessage(error.message || "Unable to sign in.");
  } finally {
    loginButtonEl.disabled = false;
  }
});

// Self-service password reset is intentionally disabled.
// Employees who forget their password must contact an EKSBASE administrator.
const disabledResetLinkEl = document.getElementById("resetPasswordLink");
if (disabledResetLinkEl) {
  disabledResetLinkEl.textContent = "Forgot your password? Please contact BOE.";
  disabledResetLinkEl.disabled = true;
  disabledResetLinkEl.setAttribute("aria-disabled", "true");
  disabledResetLinkEl.classList.add("disabled");
}

function setAdminResetMessage(message = "", isError = true) {
  if (!adminResetMessageEl) return;
  adminResetMessageEl.textContent = message;
  adminResetMessageEl.classList.toggle("error", Boolean(message && isError));
  adminResetMessageEl.classList.toggle("success", Boolean(message && !isError));
}

function openAdminResetModal() {
  if (!adminResetModalEl) return;
  adminResetEmployeeNoEl.value = "";
  setAdminResetMessage("Reset an employee password to their Employee No.", false);
  adminResetModalEl.classList.remove("hidden");
  document.body.classList.add("modal-open");
  requestAnimationFrame(() => adminResetEmployeeNoEl?.focus());
}

function closeAdminResetModal() {
  adminResetModalEl?.classList.add("hidden");
  document.body.classList.remove("modal-open");
  setAdminResetMessage("");
}

adminButtonEl?.addEventListener("click", openAdminResetModal);
document.querySelectorAll("[data-close-admin-modal]").forEach((element) => {
  element.addEventListener("click", closeAdminResetModal);
});

adminResetButtonEl?.addEventListener("click", async () => {
  const employeeNo = adminResetEmployeeNoEl?.value.trim() || "";

  if (!employeeNo) {
    setAdminResetMessage("Please enter an Employee No.");
    return;
  }

  if (!authToken || authenticatedUser?.isAdmin !== true) {
    setAdminResetMessage("Administrator authentication is required.");
    return;
  }

  adminResetButtonEl.disabled = true;
  setAdminResetMessage("Resetting employee password...", false);

  try {
    const response = await fetch(`${API_BASE_URL}/auth/standalone/admin/reset-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ employeeNo }),
    });

    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }

    if (!response.ok) {
      throw new Error(payload?.message || `Password reset failed (${response.status}).`);
    }

    setAdminResetMessage(
      `${payload.employeeName || payload.employeeNo} was reset successfully. Temporary password: ${payload.temporaryPassword || payload.employeeNo}. The employee must change it at next login.`,
      false
    );
    adminResetEmployeeNoEl.value = "";
  } catch (error) {
    setAdminResetMessage(error.message || "Unable to reset employee password.");
  } finally {
    adminResetButtonEl.disabled = false;
  }
});

passwordChangeFormEl?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const newPassword = newPasswordEl?.value || "";
  const confirmPassword = confirmPasswordEl?.value || "";

  if (newPassword.length < 8) {
    setPasswordChangeMessage("Password must be at least 8 characters.");
    return;
  }

  if (newPassword === String(authenticatedUser?.employeeNo || "").trim()) {
    setPasswordChangeMessage(
      "New password cannot remain the Employee No. Please choose a different password."
    );
    return;
  }

  if (newPassword !== confirmPassword) {
    setPasswordChangeMessage("Passwords do not match.");
    return;
  }

  if (!passwordChangeToken) {
    setPasswordChangeMessage("Password change session is missing. Please sign in again.");
    return;
  }

  passwordChangeButtonEl.disabled = true;
  setPasswordChangeMessage("Saving your new password...", false);

  try {
    const response = await fetch(`${API_BASE_URL}/auth/standalone/change-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        passwordChangeToken,
        newPassword,
      }),
    });

    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }

    if (!response.ok) {
      throw new Error(payload?.message || `Password change failed (${response.status}).`);
    }

    if (!payload?.token) {
      throw new Error("Password changed but no session token was returned.");
    }

    saveAuth(payload);
    passwordChangeToken = "";
    newPasswordEl.value = "";
    confirmPasswordEl.value = "";
    setAuthenticatedUi(true);
    loadDashboard();
  } catch (error) {
    setPasswordChangeMessage(error.message || "Unable to change password.");
  } finally {
    passwordChangeButtonEl.disabled = false;
  }
});

logoutButtonEl?.addEventListener("click", handleLogout);

const AREA_LEVELS = [
  "district",
  "region",
  "subRegion",
  "store",
  "promoter",
];

const LEVEL_LABELS = {
  district: "District",
  region: "Region",
  subRegion: "Sub-Region",
  store: "Store",
  promoter: "Promoter",
};

/*
 * EKSBASE Report dashboard drill-down hierarchy:
 *
 * HQ       -> District -> Region -> Sub-Region -> Store -> Promoter
 * District -> Region   -> Sub-Region -> Store -> Promoter
 * Region   -> Sub-Region -> Store -> Promoter
 * Area     -> Store -> Promoter
 * Promoter -> own data only
 *
 * The backend remains authoritative for data authorization. This function
 * only determines the UI's starting navigation level from the authenticated
 * role/access level.
 */
function getRoleStartingLevel() {
  const role = String(
    authenticatedUser?.role ||
    authenticatedUser?.roleCode ||
    ""
  ).trim().toUpperCase();

  const accessLevel = String(
    authenticatedUser?.accessLevel ||
    ""
  ).trim().toUpperCase();

  if (role === "PROMOTER" || accessLevel === "PROMOTER") {
    return "promoter";
  }

  if (
    accessLevel === "SUB_REGION" ||
    accessLevel === "AREA" ||
    ["KAM", "SLA", "SS", "ASM"].includes(role)
  ) {
    return "subRegion";
  }

  if (accessLevel === "REGION" || ["RAM", "RRM", "RTM", "RSH"].includes(role)) {
    return "region";
  }

  if (
    accessLevel === "DISTRICT" ||
    ["RSD", "LA", "DRH"].includes(role)
  ) {
    return "district";
  }

  // ADMIN and CSH are HQ-level roles.
  return "district";
}

const state = {
  level: "district",
  scope: {
    district: "",
    region: "",
    subRegion: "",
    warehouseCode: "",
    salesNo: "",
  },
  history: [],
  response: null,
  expandedModels: new Set(),
  searchResults: [],
  searchRequestId: 0,
  searchTimer: null,
  pendingFocus: null,
  selectedSearchFilter: null,
};

const el = (id) => document.getElementById(id);

const salesDateEnabledEl = el("salesDateEnabled");
const salesFromDateEl = el("salesFromDate");
const salesToDateEl = el("salesToDate");
const activationDateEnabledEl = el("activationDateEnabled");
const activationFromDateEl = el("activationFromDate");
const activationToDateEl = el("activationToDate");
const salesPeriodButtonsEl = el("salesPeriodButtons");
const activationPeriodButtonsEl = el("activationPeriodButtons");
const salesCustomDatesEl = el("salesCustomDates");
const activationCustomDatesEl = el("activationCustomDates");
const salesCustomRangeCaptionEl = el("salesCustomRangeCaption");
const activationCustomRangeCaptionEl = el("activationCustomRangeCaption");
const applyButton = el("applyButton");
const exportButton = el("exportButton");
const refreshButton = el("refreshButton");
const backButton = el("backButton");
const apiStatusEl = el("apiStatus");
const salesPeriodSelectEl = el("salesPeriodSelect");
const activationPeriodSelectEl = el("activationPeriodSelect");
const dateCustomizeModalEl = el("dateCustomizeModal");
const dateModalTitleEl = el("dateModalTitle");
const dateModalFromEl = el("modalDateFrom");
const dateModalToEl = el("modalDateTo");
const dateModalMessageEl = el("dateModalMessage");
const dateModalApplyEl = el("dateModalApply");
const messageEl = el("message");
const breadcrumbEl = el("breadcrumb");
const identityNameEl = el("identityName");
const identityAccessEl = el("identityAccess");
const scopeContextEl = el("scopeContext");
const globalSearchEl = el("globalSearch");
const clearSearchButton = el("clearSearchButton");
const searchResultsEl = el("searchResults");

let activeFilterBarEl =
  el("activeFilterBar");

if (!activeFilterBarEl) {
  activeFilterBarEl =
    document.createElement("div");

  activeFilterBarEl.id =
    "activeFilterBar";

  activeFilterBarEl.className =
    "active-filter-bar hidden";

  const toolbar =
    document.querySelector(
      ".toolbar"
    );

  if (toolbar) {
    toolbar.insertAdjacentElement(
      "afterend",
      activeFilterBarEl
    );
  }
}
const viewTitleEl = el("viewTitle");
const areaBody = el("areaBody");

const numberFormatter = new Intl.NumberFormat("en-PH", {
  maximumFractionDigits: 2,
});

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function todayString() {
  const now = new Date();

  const year = now.getFullYear();
  const month =
    String(
      now.getMonth() + 1
    ).padStart(2, "0");
  const day =
    String(
      now.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatLocalDate(date) {
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      date.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function periodRange(period) {
  const today =
    new Date();

  today.setHours(
    0, 0, 0, 0
  );

  let from =
    new Date(today);

  let to =
    new Date(today);

  if (
    period ===
    "yesterday"
  ) {
    from.setDate(
      from.getDate() - 1
    );

    to =
      new Date(from);
  }

  if (period === "week") {
    const day =
      today.getDay();

    const offset =
      day === 0
        ? 6
        : day - 1;

    from.setDate(
      from.getDate() -
      offset
    );
  }

  if (period === "month") {
    from =
      new Date(
        today.getFullYear(),
        today.getMonth(),
        1
      );
  }

  return {
    from:
      formatLocalDate(from),
    to:
      formatLocalDate(to),
  };
}

function openDateCustomizeModal(type) {
  const isSales = type === "sales";
  const fromEl = isSales ? salesFromDateEl : activationFromDateEl;
  const toEl = isSales ? salesToDateEl : activationToDateEl;

  dateModalTitleEl.textContent = isSales
    ? "Customize Sales Date"
    : "Customize Activation Date";
  dateModalFromEl.value = fromEl.value || todayString();
  dateModalToEl.value = toEl.value || dateModalFromEl.value;
  dateModalMessageEl.textContent = "";
  dateCustomizeModalEl.dataset.type = type;
  dateCustomizeModalEl.classList.remove("hidden");
  document.body.classList.add("modal-open");
  requestAnimationFrame(() => dateModalFromEl.focus());
}

function closeDateCustomizeModal() {
  dateCustomizeModalEl.classList.add("hidden");
  dateCustomizeModalEl.dataset.type = "";
  document.body.classList.remove("modal-open");
}

function shortDisplayDate(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDisplayDate(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function updateCustomOptionLabel(type) {
  const isSales = type === "sales";
  const selectEl = isSales
    ? salesPeriodSelectEl
    : activationPeriodSelectEl;
  const fromEl = isSales
    ? salesFromDateEl
    : activationFromDateEl;
  const toEl = isSales
    ? salesToDateEl
    : activationToDateEl;

  if (!selectEl) return;

  const option =
    selectEl.querySelector(
      'option[value="custom"]'
    );

  if (!option) return;

  const captionEl = isSales
    ? salesCustomRangeCaptionEl
    : activationCustomRangeCaptionEl;

  if (
    selectEl.value === "custom" &&
    fromEl?.value
  ) {
    option.textContent =
      "Custom dates";

    if (captionEl) {
      const safeFrom =
        fromEl.value || todayString();
      const safeTo =
        toEl?.value ||
        safeFrom;

      captionEl.innerHTML = `
        <input
          type="date"
          class="custom-range-editor-input"
          data-custom-range-type="${type}"
          data-custom-range-part="from"
          value="${safeFrom}"
          aria-label="${isSales ? "Sales" : "Activation"} date from"
        />
        <span class="custom-range-editor-separator">to</span>
        <input
          type="date"
          class="custom-range-editor-input"
          data-custom-range-type="${type}"
          data-custom-range-part="to"
          value="${safeTo}"
          aria-label="${isSales ? "Sales" : "Activation"} date to"
        />
      `;

      captionEl.style.display =
        "flex";
      captionEl.style.alignItems =
        "center";
      captionEl.style.gap =
        "6px";
      captionEl.style.padding =
        "4px 8px";
      captionEl.style.boxSizing =
        "border-box";

      captionEl
        .querySelectorAll(
          ".custom-range-editor-input"
        )
        .forEach((input) => {
          input.style.flex =
            "1 1 0";
          input.style.minWidth =
            "0";
          input.style.width =
            "100%";
          input.style.boxSizing =
            "border-box";
          input.style.cursor =
            "pointer";
        });

      captionEl.classList.add(
        "visible"
      );
    }
  } else {
    option.textContent =
      "Customize...";

    if (captionEl) {
      captionEl.innerHTML = "";
      captionEl.style.display = "";
      captionEl.classList.remove(
        "visible"
      );
    }
  }
}
function setDateRange(type, period) {
  const isSales = type === "sales";
  const fromEl = isSales ? salesFromDateEl : activationFromDateEl;
  const toEl = isSales ? salesToDateEl : activationToDateEl;
  const selectEl = isSales ? salesPeriodSelectEl : activationPeriodSelectEl;

  if (selectEl) selectEl.value = period;

  if (period === "custom") {
    const fallback = todayString();
    if (!fromEl.value) fromEl.value = fallback;
    if (!toEl.value) toEl.value = fromEl.value || fallback;
    updateCustomOptionLabel(type);
    return;
  }

  const range = periodRange(period);
  fromEl.value = range.from;
  toEl.value = range.to;
  updateCustomOptionLabel(type);
}

function setDateFilterEnabled(type, enabled) {
  const isSales = type === "sales";
  const selectEl = isSales ? salesPeriodSelectEl : activationPeriodSelectEl;
  const fromEl = isSales ? salesFromDateEl : activationFromDateEl;
  const toEl = isSales ? salesToDateEl : activationToDateEl;

  if (selectEl) selectEl.disabled = !enabled;
  fromEl.disabled = !enabled;
  toEl.disabled = !enabled;

  if (!enabled) {
    fromEl.value = "";
    toEl.value = "";
    updateCustomOptionLabel(type);
  }
}
function setDefaultDates() {
  salesDateEnabledEl.checked =
    true;

  activationDateEnabledEl.checked =
    false;

  setDateRange(
    "sales",
    "today"
  );

  setDateRange(
    "activation",
    "today"
  );

  setDateFilterEnabled(
    "sales",
    true
  );

  setDateFilterEnabled(
    "activation",
    false
  );
}
function initDateFilters() {
  setDateRange("sales", "today");
  setDateRange("activation", "today");
  setDateFilterEnabled("sales", true);
  setDateFilterEnabled("activation", false);
}

function appendDateFilterParams(
  params
) {
  const salesEnabled =
    salesDateEnabledEl.checked;

  const activationEnabled =
    activationDateEnabledEl.checked;

  params.set(
    "salesEnabled",
    salesEnabled
      ? "1"
      : "0"
  );

  params.set(
    "activationEnabled",
    activationEnabled
      ? "1"
      : "0"
  );

  if (salesEnabled) {
    params.set(
      "salesFrom",
      salesFromDateEl.value
    );

    params.set(
      "salesTo",
      salesToDateEl.value ||
      salesFromDateEl.value
    );

    // Legacy compatibility.
    params.set(
      "from",
      salesFromDateEl.value
    );

    params.set(
      "to",
      salesToDateEl.value ||
      salesFromDateEl.value
    );
  }

  if (activationEnabled) {
    params.set(
      "activationFrom",
      activationFromDateEl.value
    );

    params.set(
      "activationTo",
      activationToDateEl.value ||
      activationFromDateEl.value
    );
  }
}

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compactNumber(value) {
  const number = numberValue(value);

  if (Math.abs(number) >= 1000000) {
    return `${(number / 1000000).toFixed(1)}M`;
  }

  if (Math.abs(number) >= 1000) {
    return `${(number / 1000).toFixed(1)}K`;
  }

  return numberFormatter.format(number);
}

function compactCurrency(value) {
  const number = numberValue(value);

  if (Math.abs(number) >= 1000000) {
    return `₱${(number / 1000000).toFixed(1)}M`;
  }

  if (Math.abs(number) >= 1000) {
    return `₱${(number / 1000).toFixed(1)}K`;
  }

  return currencyFormatter.format(number);
}

function setApiStatus(connected) {
  // API connection state is intentionally not shown in the dashboard header.
  // Errors are still surfaced in the report message area.
  if (!apiStatusEl) return;
  apiStatusEl.textContent = connected ? "API: Connected" : "API: Disconnected";
  apiStatusEl.classList.toggle("connected", connected);
  apiStatusEl.classList.toggle("disconnected", !connected);
}

function setMessage(text = "", isError = false) {
  messageEl.textContent = text;
  messageEl.classList.toggle("error", isError);
}


function escapeHtml(value) {
  return String(
    value ?? ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );
}

function searchTypeLabel(type) {
  const labels = {
    district: "District",
    region: "Region",
    subRegion: "Sub-Region",
    store: "Store",
    promoter: "Promoter",
    model: "Model",
    color: "Color",
    material: "Material",
    category: "Category",
    brand: "Brand",
  };

  return labels[type] || type;
}


function renderActiveSearchFilter() {
  const filter =
    state.selectedSearchFilter;

  if (!filter) {
    activeFilterBarEl.innerHTML =
      "";

    activeFilterBarEl.classList.add(
      "hidden"
    );

    return;
  }

  activeFilterBarEl.innerHTML = `
    <div class="active-filter-chip">
      <span class="active-filter-prefix">Filtered by</span>
      <span class="active-filter-type">${escapeHtml(searchTypeLabel(filter.type))}</span>
      <strong>${escapeHtml(filter.label || filter.value)}</strong>
      <button
        type="button"
        class="active-filter-remove"
        id="removeSearchFilter"
        aria-label="Clear selected search filter"
      >×</button>
    </div>
  `;

  activeFilterBarEl.classList.remove(
    "hidden"
  );

  el("removeSearchFilter")
    ?.addEventListener(
      "click",
      () => {
        state.selectedSearchFilter =
          null;

        state.pendingFocus =
          null;

        renderActiveSearchFilter();
        loadDashboard();
      }
    );
}

function closeSearchResults() {
  searchResultsEl.classList.add(
    "hidden"
  );
}

function clearSearch({
  keepInputFocus = false,
} = {}) {
  globalSearchEl.value = "";
  state.searchResults = [];
  state.searchRequestId += 1;

  clearSearchButton.classList.add(
    "hidden"
  );

  searchResultsEl.innerHTML = "";
  closeSearchResults();

  if (keepInputFocus) {
    globalSearchEl.focus();
  }
}

function buildSearchParams(query) {
  const params =
    new URLSearchParams();

  params.set(
    "q",
    query
  );

  appendDateFilterParams(
    params
  );

  params.set(
    "limit",
    "30"
  );

  for (
    const [key, value] of
    Object.entries(
      state.scope
    )
  ) {
    if (value) {
      params.set(
        key,
        value
      );
    }
  }

  return params;
}

function renderSearchResults() {
  const query =
    globalSearchEl.value
      .trim();

  if (query.length < 2) {
    searchResultsEl.innerHTML = `
      <div class="search-hint">
        Type at least 2 characters. Search supports partial and misspelled values.
      </div>
    `;

    searchResultsEl.classList.remove(
      "hidden"
    );

    return;
  }

  if (
    state.searchResults.length ===
    0
  ) {
    searchResultsEl.innerHTML = `
      <div class="search-empty">
        No matching dashboard data found.
      </div>
    `;

    searchResultsEl.classList.remove(
      "hidden"
    );

    return;
  }

  searchResultsEl.innerHTML =
    state.searchResults
      .map(
        (
          result,
          index
        ) => {
          const stock =
            result.inventoryQty ===
              null ||
            result.inventoryQty ===
              undefined
              ? "—"
              : compactNumber(
                  result.inventoryQty
                );

          return `
            <button
              type="button"
              class="search-result"
              data-search-index="${index}"
            >
              <div class="search-result-main">
                <div class="search-result-topline">
                  <span class="search-result-type">
                    ${escapeHtml(searchTypeLabel(result.type))}
                  </span>
                  <span class="search-result-label">
                    ${escapeHtml(result.label)}
                  </span>
                </div>

                <div class="search-result-secondary">
                  ${escapeHtml(result.secondary || "")}
                </div>
              </div>

              <div class="search-result-metrics">
                <span>SO ${compactNumber(result.sellOutQty)}</span>
                <span>${compactCurrency(result.salesAmount)}</span>
                <span>STK ${stock}</span>
              </div>
            </button>
          `;
        }
      )
      .join("") +
    `
      <div class="search-hint">
        Results are limited to the current dashboard scope and date range.
      </div>
    `;

  searchResultsEl
    .querySelectorAll(
      ".search-result"
    )
    .forEach(
      (button) => {
        button.addEventListener(
          "click",
          () => {
            const index =
              Number.parseInt(
                button.dataset
                  .searchIndex ||
                "-1",
                10
              );

            const result =
              state.searchResults[
                index
              ];

            if (result) {
              applySearchResult(
                result
              );
            }
          }
        );
      }
    );

  searchResultsEl.classList.remove(
    "hidden"
  );
}

async function performSearch() {
  const query =
    globalSearchEl.value
      .trim();

  clearSearchButton
    .classList.toggle(
      "hidden",
      !query
    );

  if (query.length < 2) {
    state.searchResults = [];
    renderSearchResults();
    return;
  }

  const requestId =
    ++state.searchRequestId;

  searchResultsEl.innerHTML = `
    <div class="search-loading">
      Searching dashboard...
    </div>
  `;

  searchResultsEl.classList.remove(
    "hidden"
  );

  try {
    const params =
      buildSearchParams(
        query
      );

    const response =
      await fetchJson(
        `${API_BASE_URL}/dashboard/search?${params}`
      );

    if (
      requestId !==
      state.searchRequestId
    ) {
      return;
    }

    state.searchResults =
      response.results || [];

    renderSearchResults();
  } catch (error) {
    console.error(
      "Dashboard search failed",
      error
    );

    if (
      requestId !==
      state.searchRequestId
    ) {
      return;
    }

    searchResultsEl.innerHTML = `
      <div class="search-empty">
        Unable to search. Check the backend connection.
      </div>
    `;

    searchResultsEl.classList.remove(
      "hidden"
    );
  }
}

function scheduleSearch() {
  if (state.searchTimer) {
    clearTimeout(
      state.searchTimer
    );
  }

  state.searchTimer =
    setTimeout(
      performSearch,
      260
    );
}

function buildSearchHistory(
  scope,
  level
) {
  const history = [];

  if (
    level !== "district" &&
    scope.district
  ) {
    history.push({
      level: "district",
      scope: {
        district: "",
        region: "",
        subRegion: "",
        warehouseCode: "",
        salesNo: "",
      },
    });
  }

  if (
    ["subRegion", "store", "promoter"]
      .includes(level) &&
    scope.region
  ) {
    history.push({
      level: "region",
      scope: {
        district:
          scope.district || "",
        region: "",
        subRegion: "",
        warehouseCode: "",
        salesNo: "",
      },
    });
  }

  if (
    ["store", "promoter"]
      .includes(level) &&
    scope.subRegion
  ) {
    history.push({
      level: "subRegion",
      scope: {
        district:
          scope.district || "",
        region:
          scope.region || "",
        subRegion: "",
        warehouseCode: "",
        salesNo: "",
      },
    });
  }

  if (
    level === "promoter" &&
    scope.warehouseCode
  ) {
    history.push({
      level: "store",
      scope: {
        district:
          scope.district || "",
        region:
          scope.region || "",
        subRegion:
          scope.subRegion || "",
        warehouseCode: "",
        salesNo: "",
      },
    });
  }

  return history;
}

function applySearchResult(result) {
  const navigation =
    result.navigation || {};

  const scope = {
    district: "",
    region: "",
    subRegion: "",
    warehouseCode: "",
    salesNo: "",
    ...(
      navigation.scope ||
      {}
    ),
  };

  state.level =
    navigation.level ||
    "district";

  state.scope =
    scope;

  state.history =
    buildSearchHistory(
      scope,
      state.level
    );

  state.expandedModels.clear();

  state.pendingFocus = {
    model:
      navigation.focusModel ||
      "",
    color:
      navigation.focusColor ||
      "",
  };

  const resultFilter =
    result.filter || {
      type:
        result.type,
      value:
        result.label,
    };

  state.selectedSearchFilter = {
    type:
      resultFilter.type,
    value:
      resultFilter.value,
    label:
      result.label,
  };

  renderActiveSearchFilter();

  clearSearch();

  loadDashboard();
}


function currentQueryParams() {
  const params = new URLSearchParams();

  appendDateFilterParams(
    params
  );

  params.set(
    "level",
    state.level
  );

  for (const [key, value] of Object.entries(state.scope)) {
    if (value) {
      params.set(key, value);
    }
  }

  if (state.selectedSearchFilter) {
    params.set(
      "filterType",
      state.selectedSearchFilter.type
    );

    params.set(
      "filterValue",
      state.selectedSearchFilter.value
    );
  }

  return params;
}

function areaNextLevel() {
  const index = AREA_LEVELS.indexOf(state.level);

  if (index < 0 || index >= AREA_LEVELS.length - 1) {
    return null;
  }

  return AREA_LEVELS[index + 1];
}

function buildBreadcrumb() {
  const parts = [];

  if (state.scope.district) {
    parts.push(state.scope.district);
  }

  if (state.scope.region) {
    parts.push(state.scope.region);
  }

  if (state.scope.subRegion) {
    parts.push(state.scope.subRegion);
  }

  if (state.scope.warehouseCode) {
    const storeName =
      state.response?.navigation?.breadcrumbs?.find(
        (item) => item.level === "store"
      )?.name || state.scope.warehouseCode;

    parts.push(storeName);
  }

  if (state.scope.salesNo) {
    const promoterName =
      state.response?.navigation?.breadcrumbs?.find(
        (item) => item.level === "promoter"
      )?.name || state.scope.salesNo;

    parts.push(promoterName);
  }

  breadcrumbEl.textContent = parts.length
    ? parts.join(" › ")
    : "All Areas";
}


function renderAuthorizationContext(response) {
  const auth = response?.authorization || {};

  const authenticated = Boolean(auth.authenticated);
  const employeeNo = String(auth.employeeNo || "").trim();
  const role = String(auth.role || "").trim();
  const accessLevel = String(auth.accessLevel || "").trim();
  const organizationCode = String(auth.organizationCode || "110").trim();

  // Display the employee's actual Kingdee name first, then Employee No.
  // Fall back to the Employee No. only if the name is not available yet.
  const employeeName = String(
    auth.employeeName ||
    authenticatedUser?.employeeName ||
    authenticatedUser?.name ||
    employeeNo ||
    "Employee"
  ).trim();

  if (authenticated && employeeNo) {
    if (identityNameEl) {
      identityNameEl.textContent = employeeName;
    }
    if (identityAccessEl) {
      identityAccessEl.textContent = employeeNo;
    }
  } else {
    if (identityNameEl) {
      identityNameEl.textContent = "Standalone";
    }
    if (identityAccessEl) {
      identityAccessEl.textContent = "Local Dashboard";
    }
  }

  const scope = response?.authorization?.scope || state.scope || {};
  const parts = [];

  if (scope.district) parts.push(`District: ${scope.district}`);
  if (scope.region) parts.push(`Region: ${scope.region}`);
  if (scope.subRegion) parts.push(`Sub-Region: ${scope.subRegion}`);
  if (scope.warehouseCode) parts.push(`Store: ${scope.warehouseCode}`);
  if (scope.salesNo) parts.push(`Promoter: ${scope.salesNo}`);

  // The scope context banner was intentionally removed from the UI.
  // Keep authorization data available for logic, but do not attempt to
  // update a DOM element that no longer exists.
  if (scopeContextEl) {
    if (authenticated || parts.length) {
      scopeContextEl.textContent =
        `${authenticated ? "Authorized Scope" : "Current Scope"} · Org ${organizationCode} · ${parts.join(" · ") || "All permitted areas"}`;
      scopeContextEl.classList.remove("hidden");
    } else {
      scopeContextEl.classList.add("hidden");
    }
  }
}

function renderKpis(kpis) {
  el("inventoryQty").textContent = compactNumber(kpis.inventoryQty);
  el("sellOutQty").textContent = compactNumber(kpis.sellOutQty);
  el("salesAmount").textContent = compactCurrency(kpis.salesAmount);
  el("avgDailySellOut").textContent =
    numberFormatter.format(numberValue(kpis.averageDailySellOut));

  el("totalSellOut").textContent = compactNumber(kpis.sellOutQty);
  el("totalSalesAmount").textContent = compactCurrency(kpis.salesAmount);

  el("totalStock").textContent =
    state.level === "promoter"
      ? "—"
      : compactNumber(kpis.inventoryQty);
}

function buildModelRows(models, areaKey) {
  const rows = [];

  for (const model of models || []) {
    const modelKey =
      `${areaKey}::${String(model.key || model.model || "")}`;

    const isExpanded =
      state.expandedModels.has(modelKey);

    const modelStock =
      model.inventoryQty === null ||
      model.inventoryQty === undefined
        ? "—"
        : compactNumber(model.inventoryQty);

    rows.push(`
      <tr
        class="model-row"
        data-model-key="${encodeURIComponent(modelKey)}"
        data-model-name="${encodeURIComponent(model.model || model.key || "")}"
        data-has-children="${model.hasChildren ? "1" : "0"}"
      >
        <td>
          <div class="model-name model-indent">
            <span class="chevron">
              ${model.hasChildren ? (isExpanded ? "⌄" : "›") : "•"}
            </span>
            <span>${model.model || model.key || ""}</span>
          </div>
        </td>
        <td>${compactNumber(model.sellOutQty)}</td>
        <td>${compactCurrency(model.salesAmount)}</td>
        <td>${modelStock}</td>
      </tr>
    `);

    if (isExpanded) {
      for (const color of model.colors || []) {
        const colorStock =
          color.inventoryQty === null ||
          color.inventoryQty === undefined
            ? "—"
            : compactNumber(color.inventoryQty);

        rows.push(`
          <tr class="color-row">
            <td>
              <div class="color-name color-indent">
                ${color.color || "No Color"}
              </div>
            </td>
            <td>${compactNumber(color.sellOutQty)}</td>
            <td>${compactCurrency(color.salesAmount)}</td>
            <td>${colorStock}</td>
          </tr>
        `);
      }
    }
  }

  return rows.join("");
}

function renderAreaRows(rows) {
  const nextLevel = areaNextLevel();

  /*
   * The backend currently returns one model collection for the
   * selected page scope. For pages with one area row, these models
   * belong directly under that row.
   *
   * For pages with multiple area rows, we fetch each area's scoped
   * models so every area displays its models by default.
   */
  areaBody.innerHTML = (rows || [])
    .map((row) => {
      const canDrill = Boolean(nextLevel);

      const stock =
        row.inventoryQty === null ||
        row.inventoryQty === undefined
          ? "—"
          : compactNumber(row.inventoryQty);

      return `
        <tr
          class="area-row"
          data-key="${encodeURIComponent(row.key || "")}"
          data-name="${encodeURIComponent(row.name || "")}"
          data-warehouse-code="${encodeURIComponent(row.warehouseCode || "")}"
          data-sales-no="${encodeURIComponent(row.salesNo || "")}"
          data-can-drill="${canDrill ? "1" : "0"}"
        >
          <td>
            <div class="area-name">
              <span>${row.name || row.key || ""}</span>
            </div>
          </td>
          <td>${compactNumber(row.sellOutQty)}</td>
          <td>${compactCurrency(row.salesAmount)}</td>
          <td>${stock}</td>
        </tr>

        <tr class="models-loading-row" data-area-models-for="${encodeURIComponent(row.key || "")}">
          <td colspan="4">
            <div class="models-loading">Loading models...</div>
          </td>
        </tr>
      `;
    })
    .join("");

  areaBody.querySelectorAll(".area-row").forEach((rowEl) => {
    rowEl.addEventListener("click", () => {
      if (rowEl.dataset.canDrill !== "1") {
        return;
      }

      const key = decodeURIComponent(rowEl.dataset.key || "");
      const name = decodeURIComponent(rowEl.dataset.name || "");
      const warehouseCode =
        decodeURIComponent(rowEl.dataset.warehouseCode || "");
      const salesNo =
        decodeURIComponent(rowEl.dataset.salesNo || "");

      drillArea({
        key,
        name,
        warehouseCode,
        salesNo,
      });
    });
  });
}

function buildAreaScopedParams(row) {
  const params = new URLSearchParams();

  appendDateFilterParams(
    params
  );

  params.set(
    "level",
    state.level
  );

  const scoped = { ...state.scope };

  switch (state.level) {
    case "district":
      scoped.district = row.key || row.name || "";
      break;

    case "region":
      scoped.region = row.key || row.name || "";
      break;

    case "subRegion":
      scoped.subRegion = row.key || row.name || "";
      break;

    case "store":
      scoped.warehouseCode = row.warehouseCode || row.key || "";
      break;

    case "promoter":
      scoped.salesNo = row.salesNo || row.key || "";
      break;

    default:
      break;
  }

  for (const [key, value] of Object.entries(scoped)) {
    if (value) {
      params.set(key, value);
    }
  }

  return params;
}

async function loadModelsForAreaRows(rows) {
  const jobs = (rows || []).map(async (row) => {
    const areaKey = String(row.key || row.name || "");
    const selector = `[data-area-models-for="${CSS.escape(encodeURIComponent(areaKey))}"]`;
    const loadingRow = areaBody.querySelector(selector);

    try {
      const params = buildAreaScopedParams(row);

      const scopedResponse = await fetchJson(
        `${API_BASE_URL}/dashboard/summary?${params}`
      );

      if (!loadingRow) {
        return;
      }

      const focusModel =
        state.pendingFocus?.model ||
        "";

      if (focusModel) {
        const matchedModel =
          (
            scopedResponse.models ||
            []
          ).find(
            (model) =>
              String(
                model.model ||
                model.key ||
                ""
              ).toLowerCase() ===
              String(
                focusModel
              ).toLowerCase()
          );

        if (matchedModel) {
          const matchedKey =
            `${areaKey}::${String(
              matchedModel.key ||
              matchedModel.model ||
              ""
            )}`;

          state.expandedModels.add(
            matchedKey
          );
        }
      }

      const wrapper = document.createElement("tbody");
      wrapper.innerHTML = buildModelRows(
        scopedResponse.models || [],
        areaKey
      );

      const modelRows = Array.from(wrapper.children);

      if (modelRows.length === 0) {
        loadingRow.innerHTML = `
          <td colspan="4">
            <div class="models-loading muted">No models</div>
          </td>
        `;
        return;
      }

      for (const modelRow of modelRows) {
        loadingRow.parentNode.insertBefore(modelRow, loadingRow);
      }

      loadingRow.remove();
    } catch (error) {
      console.error("Unable to load models for area", areaKey, error);

      if (loadingRow) {
        loadingRow.innerHTML = `
          <td colspan="4">
            <div class="models-loading error-text">Unable to load models</div>
          </td>
        `;
      }
    }
  });

  await Promise.all(jobs);

  const pendingModel =
    state.pendingFocus?.model ||
    "";

  if (pendingModel) {
    const target =
      Array.from(
        areaBody.querySelectorAll(
          ".model-row"
        )
      ).find(
        (row) =>
          decodeURIComponent(
            row.dataset.modelName ||
            ""
          ).toLowerCase() ===
          pendingModel.toLowerCase()
      );

    if (target) {
      target.classList.add(
        "search-focus"
      );

      target.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    }
  }

  state.pendingFocus = null;

  areaBody.querySelectorAll(".model-row").forEach((modelRow) => {
    modelRow.addEventListener("click", (event) => {
      event.stopPropagation();

      if (modelRow.dataset.hasChildren !== "1") {
        return;
      }

      const modelKey =
        decodeURIComponent(modelRow.dataset.modelKey || "");

      if (state.expandedModels.has(modelKey)) {
        state.expandedModels.delete(modelKey);
      } else {
        state.expandedModels.add(modelKey);
      }

      renderCurrentPage();
    });
  });
}

async function renderCurrentPage() {
  const response = state.response;

  if (!response) {
    return;
  }

  renderAuthorizationContext(response);
  renderKpis(response.kpis || {});
  renderAreaRows(response.areaRows || []);
  updateNavigationUi();

  await loadModelsForAreaRows(response.areaRows || []);
}

function updateNavigationUi() {
  if (backButton) {
    backButton.classList.toggle("hidden", state.history.length === 0);
    backButton.disabled = state.history.length === 0;
  }

  if (breadcrumbEl) {
    buildBreadcrumb();
  }
}

function saveHistory() {
  state.history.push({
    level: state.level,
    scope: { ...state.scope },
  });
}

function drillArea(row) {
  const nextLevel = areaNextLevel();

  if (!nextLevel) {
    return;
  }

  saveHistory();

  switch (state.level) {
    case "district":
      state.scope.district = row.key || row.name;
      break;

    case "region":
      state.scope.region = row.key || row.name;
      break;

    case "subRegion":
      state.scope.subRegion = row.key || row.name;
      break;

    case "store":
      state.scope.warehouseCode =
        row.warehouseCode || row.key;
      break;

    default:
      break;
  }

  state.level = nextLevel;
  state.expandedModels.clear();

  loadDashboard();
}

function goBack() {
  const previous = state.history.pop();

  if (!previous) {
    return;
  }

  state.level = previous.level;
  state.scope = { ...previous.scope };
  state.expandedModels.clear();

  loadDashboard();
}

async function fetchJson(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: isDingTalkSession ? "include" : (options.credentials || "same-origin"),
  });

  if (response.status === 401) {
    clearStoredAuth();
    setAuthenticatedUi(false);
    setLoginMessage("Your session has expired. Please sign in again.");
    throw new Error("Authentication required.");
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }

  return response.json();
}

async function syncSelectedSalesDateRange() {
  const fromDate = String(
    salesFromDateEl?.value || ""
  ).trim();

  const toDate = String(
    salesToDateEl?.value || ""
  ).trim();

  if (!fromDate) {
    throw new Error(
      "Please select a Sales Date range before refreshing."
    );
  }

  const params = new URLSearchParams({
    fromDate,
    toDate,
    limit: "100",
  });

  setMessage("Synchronizing sell-out data from Kingdee...");

  const result = await fetchJson(
    `${API_BASE_URL}/kingdee/serial-data-sync-all?${params}`
  );

  console.log(
    "[REFRESH] Kingdee sell-out sync complete:",
    result
  );

  return result;
}

async function refreshDashboard() {
  if (refreshButton.disabled) return;

  refreshButton.disabled = true;
  exportButton.disabled = true;
  document.body.classList.add("dashboard-loading");

  try {
    await syncSelectedSalesDateRange();
    await loadDashboard();
  } catch (error) {
    console.error(error);

    setApiStatus(false);
    setMessage(
      error?.message ||
        "Unable to synchronize sell-out data from Kingdee.",
      true
    );
  } finally {
    refreshButton.disabled = false;
    document.body.classList.remove("dashboard-loading");
  }
}

async function loadDashboard() {
  document.body.classList.add("dashboard-loading");
  exportButton.disabled = true;
  setMessage("Loading dashboard...");

  try {
    const params = currentQueryParams();

    const response = await fetchJson(
      `${API_BASE_URL}/dashboard/summary?${params}`
    );

    state.response = response;

    /*
     * The backend is authoritative for authorization and data scope.
     * Preserve the frontend's requested drill-down level after navigation.
     *
     * On the initial dashboard load (no navigation history), use the
     * authenticated role's required starting level:
     * HQ -> District
     * District -> Region
     * Region -> Sub-Region
     * Area -> Store
     * Promoter -> Promoter
     *
     * After a drill-down, do not overwrite state.level with the backend's
     * minimum/starting level; doing so would reset District/Region/Area
     * users back to their starting page on every request.
     */
    if (state.history.length === 0) {
      state.level = getRoleStartingLevel();
    }

    await renderCurrentPage();

    setApiStatus(true);
    setMessage("");
    exportButton.disabled = false;
  } catch (error) {
    console.error(error);

    setApiStatus(false);
    setMessage(
      "Unable to load dashboard data. Check the backend and dashboard route.",
      true
    );
  } finally {
    document.body.classList.remove("dashboard-loading");
  }
}

function resetAreaNavigation() {
  state.level = getRoleStartingLevel();
  state.scope = {
    district: "",
    region: "",
    subRegion: "",
    warehouseCode: "",
    salesNo: "",
  };
  state.history = [];
  state.expandedModels.clear();
}

function getEffectiveExportScope() {
  const scope = {
    ...state.scope,
  };

  /*
   * The page level represents the level currently being displayed.
   * When that level contains exactly one visible area row, treat that
   * row as the effective export scope as well.
   *
   * Export therefore follows the same authorized drill-down path:
   * HQ -> District -> Region -> Sub-Region -> Store -> Promoter.
   */
  const rows =
    state.response?.areaRows || [];

  if (rows.length === 1) {
    const row = rows[0];

    switch (state.level) {
      case "district":
        scope.district =
          row.key ||
          row.name ||
          scope.district;
        break;

      case "region":
        scope.region =
          row.key ||
          row.name ||
          scope.region;
        break;

      case "subRegion":
        scope.subRegion =
          row.key ||
          row.name ||
          scope.subRegion;
        break;

      case "store":
        scope.warehouseCode =
          row.warehouseCode ||
          row.key ||
          scope.warehouseCode;
        break;

      case "promoter":
        scope.salesNo =
          row.salesNo ||
          row.key ||
          scope.salesNo;
        break;

      default:
        break;
    }
  }

  return scope;
}

  async function exportExcel() {
  /*
   * Standalone authentication uses authToken.
   * DingTalk SSO uses the EKSBASE dashboard session cookie.
   *
   * Therefore, an authenticated DingTalk session does not have
   * an authToken and must still be allowed to export.
   */
   if (!authToken && !isDingTalkSession) {
    setLoginMessage("Your session has expired. Please sign in again.");
    setAuthenticatedUi(false);
    return;
   }

  const params = currentQueryParams();
  const currentUser = authenticatedUser || {};
  const department = String(
    currentUser.department || currentUser.Department || "CurrentAreaAccess"
  ).trim();
  const safeDepartment = (department || "CurrentAreaAccess")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[. ]+|[. ]+$/g, "") || "CurrentAreaAccess";

  // Capture the timestamp when the user starts the export so the filename
  // represents the actual export action.
  const exportTimestamp = new Date();
  const stamp = `${exportTimestamp.getFullYear()}${String(exportTimestamp.getMonth() + 1).padStart(2, "0")}${String(exportTimestamp.getDate()).padStart(2, "0")}_${String(exportTimestamp.getHours()).padStart(2, "0")}${String(exportTimestamp.getMinutes()).padStart(2, "0")}${String(exportTimestamp.getSeconds()).padStart(2, "0")}`;
    const filename = `EKSBASE_Report_${safeDepartment}_${stamp}.xlsx`;

    /*
     * Mobile WebViews (DingTalk in-app browser on Android/iOS) cannot
     * deliver Blob downloads: anchor.download + object URL is silently
     * ignored. Instead, ask the backend for a one-time, short-lived export
     * ticket and navigate directly to the export URL. The ticket works for
     * both DingTalk sessions and standalone (employee no. + password) logins.
     */
    const isMobileWebView = /Android|iPhone|iPad|iPod|Mobile/i.test(
      navigator.userAgent
    );

    if (isMobileWebView) {
      exportButton.disabled = true;
      setMessage("Preparing Excel export...", false);

      try {
        const ticketResponse = await fetch(
          `${API_BASE_URL}/dashboard/export-ticket`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              ...(authToken
                ? { Authorization: `Bearer ${authToken}` }
                : {}),
            },
            credentials: isDingTalkSession ? "include" : "same-origin",
            cache: "no-store",
          }
        );

        if (ticketResponse.status === 401) {
          clearStoredAuth();
          setAuthenticatedUi(false);
          setLoginMessage("Your session has expired. Please sign in again.");
          return;
        }

        if (!ticketResponse.ok) {
          throw new Error(
            `Export ticket request failed (${ticketResponse.status}).`
          );
        }

        const ticketPayload = await ticketResponse.json();
        const ticket = String(ticketPayload?.ticket || "");

        if (!ticket) {
          throw new Error(
            "The export server did not return a download ticket."
          );
        }

        window.location.href = `${API_BASE_URL}/dashboard/export?${params.toString()}&ticket=${encodeURIComponent(ticket)}`;

        setMessage(
          "Excel export completed. If no file appeared, check the DingTalk download manager or preview screen.",
          false
        );
      } catch (error) {
        console.error("Excel export failed", error);
        setMessage(error.message || "Unable to export Excel.", true);
      } finally {
        exportButton.disabled = false;
      }

      return;
    }

    exportButton.disabled = true;
  setMessage("Preparing Excel export...", false);

  try {
    const response = await fetch(`${API_BASE_URL}/dashboard/export?${params.toString()}`, {
      method: "GET",
      headers: {
        Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      credentials: isDingTalkSession ? "include" : "same-origin",
      cache: "no-store",
    });

    if (response.status === 401) {
      clearStoredAuth();
      setAuthenticatedUi(false);
      setLoginMessage("Your session has expired. Please sign in again.");
      return;
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${response.status} ${response.statusText}${text ? `: ${text}` : ""}`);
    }

    const blob = await response.blob();
    if (!blob || blob.size === 0) {
      throw new Error("The export response was empty. No Excel file was produced.");
    }

    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();

    // Give Chromium time to start the download before releasing the Blob URL.
    setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
      anchor.remove();
    }, 1500);

    setMessage("Excel export completed.", false);
  } catch (error) {
    console.error("Excel export failed", error);
    setMessage(error.message || "Unable to export Excel.", true);
  } finally {
    exportButton.disabled = false;
  }
}


let lastSalesPeriod = "today";
let lastActivationPeriod = "today";

function handlePeriodSelection(type) {
  const isSales = type === "sales";
  const enabledEl =
    isSales
      ? salesDateEnabledEl
      : activationDateEnabledEl;
  const selectEl =
    isSales
      ? salesPeriodSelectEl
      : activationPeriodSelectEl;

  if (
    !enabledEl.checked ||
    !selectEl
  ) {
    return;
  }

  const period =
    selectEl.value;

  if (period === "custom") {
    setDateRange(
      type,
      "custom"
    );
    return;
  }

  if (isSales) {
    lastSalesPeriod =
      period;
  } else {
    lastActivationPeriod =
      period;
  }

  setDateRange(
    type,
    period
  );
}

salesPeriodSelectEl?.addEventListener("change", () => handlePeriodSelection("sales"));
activationPeriodSelectEl?.addEventListener("change", () => handlePeriodSelection("activation"));

[
  salesCustomRangeCaptionEl,
  activationCustomRangeCaptionEl,
].forEach((captionEl) => {
  captionEl?.addEventListener(
    "change",
    (event) => {
      const input =
        event.target.closest(
          ".custom-range-editor-input"
        );

      if (!input) {
        return;
      }

      const type =
        input.dataset.customRangeType;

      const fromEl =
        type === "sales"
          ? salesFromDateEl
          : activationFromDateEl;

      const toEl =
        type === "sales"
          ? salesToDateEl
          : activationToDateEl;

      const part =
        input.dataset.customRangePart;

      if (part === "from") {
        fromEl.value =
          input.value;

        if (
          toEl.value &&
          toEl.value <
            fromEl.value
        ) {
          toEl.value =
            fromEl.value;
        }
      } else {
        toEl.value =
          input.value;

        if (
          fromEl.value &&
          toEl.value <
            fromEl.value
        ) {
          fromEl.value =
            toEl.value;
        }
      }

      updateCustomOptionLabel(
        type
      );
    }
  );
});

activationDateEnabledEl?.addEventListener("change", () => {
  const enabled = Boolean(activationDateEnabledEl.checked);
  setDateFilterEnabled("activation", enabled);
  if (enabled) {
    setDateRange("activation", lastActivationPeriod);
  }
});

salesDateEnabledEl?.addEventListener("change", () => {
  const enabled = Boolean(salesDateEnabledEl.checked);
  setDateFilterEnabled("sales", enabled);
  if (enabled) {
    setDateRange("sales", lastSalesPeriod);
  }
});

dateModalApplyEl?.addEventListener("click", () => {
  const type = dateCustomizeModalEl.dataset.type;
  const from = dateModalFromEl.value;
  const to = dateModalToEl.value || from;

  if (!type || !from) {
    dateModalMessageEl.textContent = "Please select a start date.";
    return;
  }

  if (to < from) {
    dateModalMessageEl.textContent = "The To date cannot be earlier than the From date.";
    return;
  }

  const fromEl = type === "sales" ? salesFromDateEl : activationFromDateEl;
  const toEl = type === "sales" ? salesToDateEl : activationToDateEl;
  const selectEl = type === "sales" ? salesPeriodSelectEl : activationPeriodSelectEl;

  fromEl.value = from;
  toEl.value = to;
  selectEl.value = "custom";
  updateCustomOptionLabel(type);
  closeDateCustomizeModal();
});

dateCustomizeModalEl?.querySelectorAll("[data-close-date-modal]").forEach((el) => {
  el.addEventListener("click", closeDateCustomizeModal);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !dateCustomizeModalEl.classList.contains("hidden")) {
    closeDateCustomizeModal();
  }
});

applyButton.addEventListener("click", () => {
  clearSearch();

  state.selectedSearchFilter =
    null;

  renderActiveSearchFilter();

  resetAreaNavigation();
  loadDashboard();
});

refreshButton?.addEventListener("click", refreshDashboard);

// Export must be registered before optional navigation controls so a missing
// back button cannot stop the rest of the dashboard event wiring.
exportButton.addEventListener("click", (event) => {
  event.preventDefault();
  if (exportButton.disabled) return;
  exportExcel();
});

// The current dashboard layout does not always render a back button.
// Guard the listener so its absence cannot stop script execution.
backButton?.addEventListener("click", goBack);

globalSearchEl.addEventListener(
  "input",
  scheduleSearch
);

globalSearchEl.addEventListener(
  "focus",
  () => {
    if (
      globalSearchEl.value
        .trim()
    ) {
      renderSearchResults();
    }
  }
);

globalSearchEl.addEventListener(
  "keydown",
  (event) => {
    if (
      event.key === "Escape"
    ) {
      closeSearchResults();
      return;
    }

    if (
      event.key === "Enter" &&
      state.searchResults.length >
        0
    ) {
      event.preventDefault();

      applySearchResult(
        state.searchResults[0]
      );
    }
  }
);

clearSearchButton.addEventListener(
  "click",
  () => {
    clearSearch({
      keepInputFocus: true,
    });
  }
);

document.addEventListener(
  "click",
  (event) => {
    const clickedInside =
      event.target.closest(
        ".search-shell"
      );

    if (!clickedInside) {
      closeSearchResults();
    }
  }
);

setDefaultDates();
renderActiveSearchFilter();
initializeAuthentication();
