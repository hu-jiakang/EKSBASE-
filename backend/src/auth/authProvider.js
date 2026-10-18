/*
 * Authentication-provider abstraction.
 *
 * The dashboard should depend on this normalized identity,
 * not directly on DingTalk or a future standalone login.
 */

export function normalizeIdentity({
  provider,
  subject,
  employeeNo,
}) {
  if (!provider || !subject || !employeeNo) {
    throw new Error(
      "Authentication provider returned an incomplete identity."
    );
  }

  return {
    provider: String(provider).trim().toLowerCase(),
    subject: String(subject).trim(),
    employeeNo: String(employeeNo).trim(),
  };
}
