import { Router, type IRouter } from "express";
import healthRouter from "./health";
import { createAuthRouter } from "./auth";
import { createDataRouter } from "./data";

export function createApiRouter(): IRouter {
  const router: IRouter = Router();

  router.use(healthRouter);
  router.use(createAuthRouter());
  router.use(createDataRouter());

  return router;
}
