import { login } from "./login.js";

import {
  buildQuery,
  executeBillQuery,
} from "./executeBillQuery.js";

export class KingdeeClient {
  constructor(config) {
    if (!config) {
      throw new Error("Kingdee configuration is required.");
    }

    if (config.enabled === false) {
      throw new Error(
        "Kingdee integration is disabled. Set KINGDEE_ENABLED=true to use Kingdee."
      );
    }

    const requiredFields = [
      ["baseUrl", "KINGDEE_BASE_URL"],
      ["erpAccount", "KINGDEE_ERP_ACCOUNT"],
      ["integrationUsername", "KINGDEE_INTEGRATION_USERNAME"],
      ["appId", "KINGDEE_APP_ID"],
      ["appSecret", "KINGDEE_APP_SECRET"],
    ];

    for (const [field, envName] of requiredFields) {
      if (!config[field]) {
        throw new Error(`Missing Kingdee configuration: ${envName}`);
      }
    }

    this.baseUrl = this.normalizeBaseUrl(config.baseUrl);
    this.erpAccount = config.erpAccount;
    this.integrationUsername = config.integrationUsername;
    this.appId = config.appId;
    this.appSecret = config.appSecret;
    this.languageId = Number(config.languageId || 2052);
    this.organization = config.organization || "";
    this.cookie = null;
  }

  normalizeBaseUrl(url) {
    let normalizedUrl = String(url)
      .trim()
      .replace(/\/+$/, "");

    if (!normalizedUrl.toLowerCase().endsWith("/k3cloud")) {
      normalizedUrl += "/k3cloud";
    }

    return normalizedUrl;
  }

  async login() {
    return login(this);
  }

  async executeBillQuery(options) {
    const query = buildQuery(options);
    return executeBillQuery(this, query);
  }
}
