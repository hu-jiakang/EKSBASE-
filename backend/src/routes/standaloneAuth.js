import express from "express";
import {
  changeStandalonePassword,
  createStandaloneSession,
  destroyStandaloneSession,
  restoreRememberedSession,
  resetEmployeePasswordByAdmin,
} from "../auth/standaloneAuth.js";
import { requireAuthenticatedUser } from "../auth/requireAuthenticatedUser.js";

const router = express.Router();

function getBearerToken(req) {
  const authorization = String(req.headers.authorization || "").trim();
  if (!authorization.toLowerCase().startsWith("bearer ")) return "";
  return authorization.slice(7).trim();
}

router.post("/login", async (req, res) => {
  try {
    const { employeeNo, password } = req.body || {};

    const result = await createStandaloneSession(employeeNo, password);

    return res.json({
      status: "ok",
      provider: "standalone",
      requiresPasswordChange: Boolean(result.requiresPasswordChange),
      passwordChangeToken: result.passwordChangeToken || "",
      token: result.token || "",
      expiresAt: result.expiresAt
        ? new Date(result.expiresAt).toISOString()
        : "",
      user: result.employee,
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      status: "error",
      message: error.message || "Standalone login failed.",
    });
  }
});

router.post("/change-password", async (req, res) => {
  try {
    const { passwordChangeToken, newPassword } = req.body || {};
    const result = await changeStandalonePassword(
      passwordChangeToken,
      newPassword
    );

    return res.json({
      status: "ok",
      provider: "standalone",
      requiresPasswordChange: Boolean(result.requiresPasswordChange),
      passwordChangeToken: result.passwordChangeToken || "",
      token: result.token || "",
      expiresAt: result.expiresAt
        ? new Date(result.expiresAt).toISOString()
        : "",
      user: result.employee,
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      status: "error",
      message: error.message || "Password change failed.",
    });
  }
});

router.post("/remember", async (req, res) => {
  try {
    const token = getBearerToken(req);
    const user = await restoreRememberedSession(token);

    if (!user) {
      return res.status(401).json({
        status: "error",
        message: "Remembered login is invalid or expired.",
      });
    }

    return res.json({
      status: "ok",
      provider: "standalone",
      user,
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      status: "error",
      message: error.message || "Remembered login failed.",
    });
  }
});

/*
 * Administrator password reset.
 *
 * The administrator session itself remains an environment-secret credential.
 * The employee credential being reset is persisted in the local EKSBASE
 * authentication database through localCredentials.js.
 */
router.post(
  "/admin/reset-password",
  requireAuthenticatedUser,
  async (req, res) => {
    try {
      if (String(req.authenticatedIdentity?.provider || "").toLowerCase() !== "standalone") {
        return res.status(403).json({
          status: "error",
          message: "Administrator authentication is required.",
        });
      }

      if (req.dashboardUser?.isAdmin !== true) {
        return res.status(403).json({
          status: "error",
          message: "Administrator authentication is required.",
        });
      }

      const employeeNo = String(req.body?.employeeNo || "").trim();
      const result = await resetEmployeePasswordByAdmin(employeeNo);

      return res.json({
        status: "ok",
        provider: "standalone",
        employeeNo: result.employee.employeeNo,
        employeeName: result.employee.employeeName,
        temporaryPassword: result.temporaryPassword,
        requiresPasswordChange: true,
      });
    } catch (error) {
      return res.status(error.statusCode || 400).json({
        status: "error",
        message: error.message || "Password reset failed.",
      });
    }
  }
);

router.get("/me", requireAuthenticatedUser, (req, res) => {
  return res.json({
    status: "ok",
    provider: req.authenticatedIdentity.provider,
    user: req.dashboardUser,
  });
});

router.post("/logout", async (req, res) => {
  const token = getBearerToken(req);
  await destroyStandaloneSession(token);

  return res.json({
    status: "ok",
    message: "Logged out.",
  });
});

export default router;
