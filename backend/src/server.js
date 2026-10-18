import app from "./app.js";
import { config } from "./config/env.js";
import { KingdeeClient } from "./kingdee/kingdeeClient.js";
import { startSerialSyncJob } from "./jobs/serialSyncJob.js";

const kingdeeClient = new KingdeeClient(config.kingdee);

app.listen(config.port, () => {
  console.log(
    `🚀 Server running on http://localhost:${config.port} (${config.nodeEnv})`
  );

  console.log("Kingdee authentication: LoginByAppSecret (third-party App ID/App Secret)");
  console.log("DingTalk SSO: configured separately from Kingdee.");

  startSerialSyncJob({
    intervalMinutes: 15,
    limit: 500,
  });
});
