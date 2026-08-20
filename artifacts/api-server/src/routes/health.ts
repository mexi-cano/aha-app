import { Router, type IRouter } from "express";
import { HealthCheckResponse, HealthCheckDbResponse } from "@workspace/api-zod";

const router: IRouter = Router();

// App-only liveness — must never depend on the database, so @workspace/db is
// loaded lazily inside /health rather than imported at module scope.
router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/health", async (req, res) => {
  try {
    const { sql } = await import("@workspace/db");
    await sql`select 1`;
    const data = HealthCheckDbResponse.parse({
      status: "ok",
      database: "connected",
    });
    res.json(data);
  } catch (err) {
    req.log.error(
      { err: err instanceof Error ? { name: err.name } : undefined },
      "Database health check failed",
    );
    const data = HealthCheckDbResponse.parse({
      status: "error",
      database: "unreachable",
    });
    res.status(500).json(data);
  }
});

export default router;
