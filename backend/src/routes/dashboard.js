import { Router } from "express";
import { dashboardController } from "../controllers/dashboardController.js";
import { requireAuthenticatedUser } from "../auth/requireAuthenticatedUser.js";

const router = Router();

/*
 * All dashboard endpoints require an authenticated employee.
 *
 * The middleware resolves the authenticated identity and sets:
 *   req.dashboardUser
 *
 * Authorization remains server-controlled.
 */

router.get(
  "/summary",
  requireAuthenticatedUser,
  dashboardController.getSummary
);

router.get(
  "/search",
  requireAuthenticatedUser,
  dashboardController.search
);

router.get(
  "/export",
  requireAuthenticatedUser,
  dashboardController.exportReport
);

/*
 * One-time export ticket for mobile WebViews (DingTalk in-app browser).
 * The frontend exchanges this ticket for a direct navigation download.
 */
router.post(
  "/export-ticket",
  requireAuthenticatedUser,
  dashboardController.createExportTicket
);

export default router;
