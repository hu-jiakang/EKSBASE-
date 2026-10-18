import express from "express";
import healthRouter from "./routes/health.js";
import kingdeeRouter from "./routes/kingdee.js";
import dashboardRouter from "./routes/dashboard.js";
import standaloneAuthRouter from "./routes/standaloneAuth.js";
import dingtalkAuthRouter from "./routes/dingtalkAuth.js";

const app = express();

/*
 * CORS
 *
 * Allows the configured EKSBASE frontend to communicate with
 * the backend API during development and production.
 */
const allowedOrigins = new Set([
  "http://localhost:3001",
  "https://eksbase-dashboard-frontend.onrender.com",
]);

app.use((req, res, next) => {
  const requestOrigin = req.headers.origin;

  if (allowedOrigins.has(requestOrigin)) {
    res.header("Access-Control-Allow-Origin", requestOrigin);
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Credentials", "true");
  }

  res.header(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS"
  );

  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    message: "Kingdee Data Platform API is running 🚀",
  });
});

app.use("/health", healthRouter);
app.use("/kingdee", kingdeeRouter);

/* Existing standalone Employee No. + password authentication. */
app.use("/auth/standalone", standaloneAuthRouter);

/* DingTalk SSO authentication. */
app.use("/auth/dingtalk", dingtalkAuthRouter);

/* Dashboard routes enforce authentication individually. */
app.use("/dashboard", dashboardRouter);

export default app;
