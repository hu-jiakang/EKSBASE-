import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || "development",

  kingdee: {
    enabled: String(process.env.KINGDEE_ENABLED || "true").toLowerCase() === "true",
    baseUrl: process.env.KINGDEE_BASE_URL || "",
    erpAccount: process.env.KINGDEE_ERP_ACCOUNT || "",
    integrationUsername: process.env.KINGDEE_INTEGRATION_USERNAME || "",
    appId: process.env.KINGDEE_APP_ID || "",
    appSecret: process.env.KINGDEE_APP_SECRET || "",
    languageId: Number(process.env.KINGDEE_LANGUAGE_ID || 2052),
    organization: process.env.KINGDEE_ORGANIZATION || "",
  },

  dingtalk: {
    clientId: process.env.DINGTALK_CLIENT_ID || "",
    clientSecret: process.env.DINGTALK_CLIENT_SECRET || "",
    corpId: process.env.DINGTALK_CORP_ID || "",
    agentId: process.env.DINGTALK_AGENT_ID || "",
  },

  database: {
    path: process.env.DATABASE_PATH || "./data/kingdee.db",
  },

  authDatabase: {
    path: process.env.AUTH_DATABASE_PATH || "./data/eksbase-auth.db",
  },
};
