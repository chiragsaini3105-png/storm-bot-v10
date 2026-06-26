import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

const startTime = Date.now();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// 24/7 keep-alive ping endpoint — point UptimeRobot here
router.get("/ping", (_req, res) => {
  const uptimeSec = Math.floor((Date.now() - startTime) / 1000);
  const h = Math.floor(uptimeSec / 3600);
  const m = Math.floor((uptimeSec % 3600) / 60);
  const s = uptimeSec % 60;
  res.json({
    status: "online",
    service: "Storm Bot v10",
    uptime: `${h}h ${m}m ${s}s`,
    timestamp: new Date().toISOString(),
  });
});

export default router;
