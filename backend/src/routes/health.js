import { Router } from "express";

const router = Router();

router.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "Kingdee Data Platform API",
    timestamp: new Date().toISOString(),
  });
});

export default router;
