/*
 * DingTalk identity adapter.
 *
 * The DingTalk mini-app / H5 shell should authenticate the user
 * and provide a verified DingTalk Job Number to the backend.
 *
 * IMPORTANT:
 * Do not trust a Job Number supplied by an arbitrary browser.
 * In production, replace getDingTalkIdentity() with DingTalk's
 * official server-side OAuth/JSAPI verification flow.
 */

export async function getDingTalkIdentity(req) {
  // Temporary integration contract.
  //
  // Expected verified identity:
  // req.dingtalkUser = {
  //   jobNumber: "1913444"
  // };
  //
  // The actual DingTalk OAuth implementation will populate this
  // object after validating the DingTalk access token/code.

  if (!req.dingtalkUser?.jobNumber) {
    return null;
  }

  return {
    jobNumber: String(
      req.dingtalkUser.jobNumber
    ).trim(),
  };
}
