/*
 * EKSBASE Phase 2 — DingTalk Authentication
 *
 * Flow:
 *
 * DingTalk authCode
 *      ↓
 * userAccessToken
 *      ↓
 * /v1.0/contact/users/me
 *      ↓
 * unionId
 *      ↓
 * enterprise access token
 *      ↓
 * /topapi/user/getbyunionid
 *      ↓
 * userid
 *      ↓
 * /topapi/v2/user/get
 *      ↓
 * job_number
 *      ↓
 * Kingdee Employee No.
 *
 * The user's DingTalk access token is never returned to the browser.
 */

const DINGTALK_API_BASE =
  "https://api.dingtalk.com";

const DINGTALK_LEGACY_BASE =
  "https://oapi.dingtalk.com";

function required(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}`
    );
  }

  return value.trim();
}

async function parseResponse(response) {
  const text = await response.text();

  let body;

  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {
      raw: text,
    };
  }

  if (!response.ok) {
    throw new Error(
      `DingTalk API HTTP ${response.status}: ${
        body?.message ||
        body?.errmsg ||
        text ||
        "Unknown error"
      }`
    );
  }

  return body;
}

async function postJson(
  url,
  body,
  headers = {}
) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });

  return parseResponse(response);
}

async function getJson(
  url,
  headers = {}
) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });

  return parseResponse(response);
}

/**
 * Exchange the one-time DingTalk auth code for a
 * user delegated access token.
 *
 * Official endpoint:
 * POST /v1.0/oauth2/userAccessToken
 */
async function exchangeAuthCode(authCode) {
  const clientId =
    required("DINGTALK_CLIENT_ID");

  const clientSecret =
    required("DINGTALK_CLIENT_SECRET");

  if (!authCode?.trim()) {
    throw new Error(
      "DingTalk authCode is required."
    );
  }

  return postJson(
    `${DINGTALK_API_BASE}/v1.0/oauth2/userAccessToken`,
    {
      clientId,
      clientSecret,
      code: authCode.trim(),
      grantType: "authorization_code",
    }
  );
}

/**
 * Get the current authorized user's DingTalk profile.
 *
 * This intentionally uses the current-user endpoint
 * rather than trusting a user ID sent by the browser.
 */
async function getCurrentUser(
  userAccessToken
) {
  if (!userAccessToken) {
    throw new Error(
      "DingTalk user access token is required."
    );
  }

  return getJson(
    `${DINGTALK_API_BASE}/v1.0/contact/users/me`,
    {
      "x-acs-dingtalk-access-token":
        userAccessToken,
    }
  );
}

/**
 * Get enterprise access token.
 *
 * This token stays server-side.
 */
async function getEnterpriseAccessToken() {
  const clientId =
    required("DINGTALK_CLIENT_ID");

  const clientSecret =
    required("DINGTALK_CLIENT_SECRET");

  /*
   * DingTalk's app-level access-token endpoint expects the credentials
   * using the AppKey/AppSecret field names.
   *
   * For an internal DingTalk application:
   *   AppKey    = DINGTALK_CLIENT_ID
   *   AppSecret = DINGTALK_CLIENT_SECRET
   *
   * The previous implementation sent clientId/clientSecret, which caused:
   * "appKey is mandatory for this action."
   */
  return postJson(
    `${DINGTALK_API_BASE}/v1.0/oauth2/accessToken`,
    {
      appKey: clientId,
      appSecret: clientSecret,
    }
  );
}

/**
 * Resolve DingTalk unionId to enterprise userid.
 */
async function getUserIdByUnionId(
  enterpriseAccessToken,
  unionId
) {
  if (!unionId) {
    throw new Error(
      "DingTalk unionId is required."
    );
  }

  const response =
    await postJson(
      `${DINGTALK_LEGACY_BASE}/topapi/user/getbyunionid?access_token=${encodeURIComponent(
        enterpriseAccessToken
      )}`,
      {
        unionid: unionId,
      }
    );

  const userId =
    response?.result?.userid;

  if (!userId) {
    throw new Error(
      "Unable to resolve DingTalk unionId to userid."
    );
  }

  return userId;
}

/**
 * Get detailed enterprise user profile.
 *
 * job_number is the field used for the EKSBASE identity match.
 */
async function getEnterpriseUser(
  enterpriseAccessToken,
  userId
) {
  if (!userId) {
    throw new Error(
      "DingTalk userid is required."
    );
  }

  const response =
    await postJson(
      `${DINGTALK_LEGACY_BASE}/topapi/v2/user/get?access_token=${encodeURIComponent(
        enterpriseAccessToken
      )}`,
      {
        language: "en_US",
        userid: userId,
      }
    );

  return response?.result || {};
}

/**
 * Complete DingTalk authentication.
 *
 * Returns only normalized identity data.
 * No DingTalk access token is returned.
 */
export async function authenticateDingTalk(authCode) {
  if (!authCode?.trim()) {
    throw new Error("DingTalk authCode is required.");
  }

  /*
   * This follows the proven DingTalk H5 SSO implementation used by the
   * working application:
   *
   * authCode
   *   -> enterprise access token
   *   -> topapi/v2/user/getuserinfo
   *   -> userid
   *   -> topapi/v2/user/get
   *   -> job_number
   *   -> Kingdee Employee No.
   *
   * The browser never receives the enterprise access token.
   */
  const enterpriseTokenResponse =
    await getEnterpriseAccessToken();

  const enterpriseAccessToken =
    enterpriseTokenResponse?.accessToken ||
    enterpriseTokenResponse?.access_token;

  if (!enterpriseAccessToken) {
    throw new Error(
      "DingTalk did not return an enterprise access token."
    );
  }

  const userInfoResponse =
    await postJson(
      `${DINGTALK_LEGACY_BASE}/topapi/v2/user/getuserinfo?access_token=${encodeURIComponent(
        enterpriseAccessToken
      )}`,
      {
        code: authCode.trim(),
      }
    );

  const userId = String(
    userInfoResponse?.result?.userid ||
    userInfoResponse?.result?.userId ||
    ""
  ).trim();

  if (!userId) {
    throw new Error(
      "DingTalk did not return a userid for the authorization code."
    );
  }

  const enterpriseUser =
    await getEnterpriseUser(
      enterpriseAccessToken,
      userId
    );

  const jobNumber = String(
    enterpriseUser?.job_number ||
    enterpriseUser?.jobnumber ||
    ""
  ).trim();

  if (!jobNumber) {
    throw new Error(
      "DingTalk user has no job number."
    );
  }

  return {
    provider: "dingtalk",
    providerSubject:
      String(
        enterpriseUser?.unionid ||
        enterpriseUser?.unionId ||
        userId
      ).trim(),

    employeeNo: jobNumber,

    dingtalkUserId: userId,

    displayName:
      String(
        enterpriseUser?.name ||
        ""
      ).trim(),

    avatar:
      String(
        enterpriseUser?.avatar ||
        ""
      ).trim(),

    active:
      enterpriseUser?.active !== false,
  };
}
