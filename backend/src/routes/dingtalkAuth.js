import express from "express";

import {
  loginWithDingTalk,
  logout,
  getCurrentUser,
  getDingTalkConfig,
} from "../controllers/dingtalkAuthController.js";

import {
  requireAuthenticatedUser,
} from "../auth/requireAuthenticatedUser.js";

const router = express.Router();

router.get("/config", getDingTalkConfig);


/*
 * Frontend obtains a one-time DingTalk authCode using the official
 * DingTalk JSAPI and posts that code here.
 *
 * POST /auth/dingtalk/login
 */
router.post(
  "/login",
  express.json(),
  loginWithDingTalk
);

router.get(
  "/me",
  requireAuthenticatedUser,
  getCurrentUser
);

router.post(
  "/logout",
  logout
);

export default router;
