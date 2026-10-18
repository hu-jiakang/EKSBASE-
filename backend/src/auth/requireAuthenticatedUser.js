import { getStandaloneUser } from "./standaloneAuth.js";
import { readDashboardSession } from "./dashboardSession.js";
import { getDashboardEmployee } from "./dashboardEmployee.js";
import { consumeExportTicket } from "./exportTicket.js";

function getBearerToken(req) {
  const authorization = String(req.headers.authorization || "").trim();
  if (!authorization.toLowerCase().startsWith("bearer ")) return "";
  return authorization.slice(7).trim();
}

/**
 * Provider-neutral EKSBASE authentication middleware.
 *
 * Authentication identifies the Employee No.
 * Kingdee Employee Master is the authoritative source for employee status
 * and dashboard hierarchy. No employee_access/Neon authorization lookup is
 * performed.
 */
export async function requireAuthenticatedUser(req, res, next) {
  try {
    // One-time export ticket: lets mobile WebViews (DingTalk) download via
    // direct navigation when an Authorization header cannot be attached.
    const ticketIdentity = consumeExportTicket(req.query?.ticket);

    if (ticketIdentity) {
      req.authenticatedIdentity = ticketIdentity.identity;
      req.dashboardUser = ticketIdentity.user;
      return next();
    }

    const bearerToken = getBearerToken(req);
    const standaloneUser = await getStandaloneUser(bearerToken);

    if (standaloneUser) {
      req.authenticatedIdentity = {
        provider: "standalone",
        providerSubject: standaloneUser.employeeNo,
        employeeNo: standaloneUser.employeeNo,
      };
      req.dashboardUser = standaloneUser;
      return next();
    }

    const session = readDashboardSession(req);

    if (!session?.employeeNo || !session?.provider) {
      return res.status(401).json({
        status: "error",
        message: "Authentication required.",
      });
    }

    const employee = await getDashboardEmployee(session.employeeNo);

    if (!employee || employee.disabled || employee.isActive !== 1) {
      return res.status(403).json({
        status: "error",
        message: "Your Kingdee employee account is disabled or unavailable.",
        employeeNo: session.employeeNo,
      });
    }

    req.authenticatedIdentity = {
      ...session,
      provider: String(session.provider).trim().toLowerCase(),
      providerSubject:
        String(
          session.providerSubject || session.subject || session.employeeNo
        ).trim(),
      employeeNo: employee.employeeNo,
    };
    req.dashboardUser = employee;

    return next();
  } catch (error) {
    return next(error);
  }
}
