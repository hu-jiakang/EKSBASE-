/*
 * Provider-neutral integration example.
 *
 * Authentication happens before this route.
 *
 * Provider adapter:
 *   DingTalk / Local / Future SSO
 *          ↓
 * req.authenticatedIdentity
 *
 * Then:
 *   requireAuthenticatedUser
 *          ↓
 * req.dashboardUser
 *          ↓
 * dashboardController / dashboardService
 *
 * Existing dashboard calculations remain unchanged.
 */
