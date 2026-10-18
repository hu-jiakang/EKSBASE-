import {
  authenticateDingTalk,
} from "../auth/dingtalkAuthService.js";

import {
  setDashboardSession,
  clearDashboardSession,
  destroyDashboardSession,
} from "../auth/dashboardSession.js";

import {
  getDashboardEmployee,
} from "../auth/dashboardEmployee.js";

export async function loginWithDingTalk(req, res, next) {
  const startedAt = performance.now();

  try {
    const authCode = String(req.body?.authCode || "").trim();

    if (!authCode) {
      return res.status(400).json({
        status: "error",
        message: "authCode is required.",
      });
    }

    console.log("[DINGTALK SSO] Authentication START");

    const identity = await authenticateDingTalk(authCode);

    console.log(
      `[DINGTALK SSO] Identity resolved +${Math.round(performance.now() - startedAt)}ms | employeeNo=${identity.employeeNo}`
    );

    /*
     * Critical identity rule:
     * DingTalk Job Number = Kingdee Employee No.
     *
     * The browser never supplies the Employee No. The backend obtains it
     * from DingTalk and resolves that Employee No directly in Kingdee.
     */
    const employee = await getDashboardEmployee(identity.employeeNo);

    if (!employee) {
      return res.status(403).json({
        status: "error",
        message:
          "Your DingTalk Job Number was not found in the Kingdee Employee Master.",
        employeeNo: identity.employeeNo,
      });
    }

    if (employee.disabled || employee.isActive !== 1) {
      return res.status(403).json({
        status: "error",
        message: "Your Kingdee employee account is disabled.",
        employeeNo: identity.employeeNo,
      });
    }

    if (
      String(employee.employeeNo).trim().toUpperCase() !==
      String(identity.employeeNo).trim().toUpperCase()
    ) {
      return res.status(403).json({
        status: "error",
        message: "DingTalk Job Number does not match the Kingdee Employee No.",
      });
    }


    console.log(
      `[DINGTALK SSO] Dashboard session creation START +${Math.round(performance.now() - startedAt)}ms | employeeNo=${identity.employeeNo}`
    );

    setDashboardSession(res, {
      provider: "dingtalk",
      providerSubject: identity.providerSubject,
      employeeNo: employee.employeeNo,
      displayName: identity.displayName || employee.employeeName || "",
      avatar: identity.avatar || "",
    });

    console.log(
      `[DINGTALK SSO] Authentication COMPLETE +${Math.round(performance.now() - startedAt)}ms | employeeNo=${identity.employeeNo}`
    );

    return res.json({
      status: "ok",
      provider: "dingtalk",
      user: {
        ...employee,
        displayName: identity.displayName || employee.employeeName || "",
        avatar: identity.avatar || "",
      },
    });
  } catch (error) {
    console.error(
      `[DINGTALK SSO] Authentication FAILED +${Math.round(performance.now() - startedAt)}ms:`,
      error?.message || error
    );
    return next(error);
  }
}

export function logout(req, res) {
  destroyDashboardSession(req, res);

  return res.json({
    status: "ok",
  });
}

export function getCurrentUser(req, res) {
  if (!req.dashboardUser) {
    return res.status(401).json({
      status: "error",
      message: "Authentication required.",
    });
  }

  return res.json({
    status: "ok",
    provider: req.authenticatedIdentity?.provider || "",
    user: req.dashboardUser,
  });
}


export function getDingTalkConfig(_req, res) {
  return res.json({
    status: "ok",
    configured: Boolean(
      process.env.DINGTALK_CLIENT_ID &&
      process.env.DINGTALK_CORP_ID
    ),
    clientId: process.env.DINGTALK_CLIENT_ID || "",
    corpId: process.env.DINGTALK_CORP_ID || "",
    agentId: process.env.DINGTALK_AGENT_ID || "",
  });
}
