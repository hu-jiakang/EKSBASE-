import express from "express";
import {
  createStandaloneSession,
  destroyStandaloneSession,
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
      token: result.token,
      expiresAt: new Date(result.expiresAt).toISOString(),
      user: result.employee,
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      status: "error",
      message: error.message || "Standalone login failed.",
    });
  }
});

router.get("/me", requireAuthenticatedUser, (req, res) => {
  return res.json({
    status: "ok",
    provider: req.authenticatedIdentity.provider,
    user: req.dashboardUser,
  });
});

router.post("/logout", (req, res) => {
  const token = getBearerToken(req);
  destroyStandaloneSession(token);

  return res.json({
    status: "ok",
    message: "Logged out.",
  });
});

export default router;
