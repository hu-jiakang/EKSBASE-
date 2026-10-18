/*
 * Standalone/local authentication provider.
 *
 * This provider is intentionally separate from authorization.
 * It can be enabled when EKSBASE runs as a standalone application.
 *
 * Production implementation can use:
 * - username/password
 * - enterprise SSO
 * - Microsoft Entra ID
 * - another identity provider
 *
 * The provider must return the same normalized identity shape:
 *
 * {
 *   provider: "local",
 *   subject: "unique-provider-user-id",
 *   employeeNo: "1913444"
 * }
 */

export async function authenticateLocal(credentials) {
  // Implement standalone authentication here when enabled.
  // Do not put dashboard access rules in this provider.

  throw new Error(
    "Standalone authentication provider is not enabled yet."
  );
}
