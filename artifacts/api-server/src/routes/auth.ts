import { Router, type IRouter } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";

import {
  getAuthConfigFromEnv,
  issueAccessToken,
  verifyAccessCode,
  type AuthConfig,
} from "../lib/auth";
import { sendProblem } from "../lib/problem";

const authRequestSchema = z
  .object({ accessCode: z.string().min(1).max(128) })
  .strict();

export function createAuthRouter(
  getConfig: () => AuthConfig = getAuthConfigFromEnv,
): IRouter {
  const router: IRouter = Router();
  const limiter = rateLimit({
    windowMs: 60_000,
    limit: 5,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    handler(_request, response) {
      sendProblem(
        response,
        429,
        "too-many-access-code-attempts",
        "Too many attempts",
        "Wait a minute, then try the crew access code again.",
      );
    },
  });

  router.post("/auth", limiter, async (request, response) => {
    const parsed = authRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      sendProblem(
        response,
        400,
        "invalid-access-code-request",
        "Access code required",
        "Enter the crew access code and try again.",
      );
      return;
    }

    try {
      const config = getConfig();
      if (
        !(await verifyAccessCode(parsed.data.accessCode, config.accessCodeHash))
      ) {
        sendProblem(
          response,
          401,
          "access-code-rejected",
          "Access code not accepted",
          "That access code didn't work. Try again.",
        );
        return;
      }
      response.json(issueAccessToken(config));
    } catch (error) {
      request.log.error(
        { err: error instanceof Error ? { name: error.name } : undefined },
        "Access-code verification unavailable",
      );
      sendProblem(
        response,
        503,
        "authentication-unavailable",
        "Access check unavailable",
        "Connect to the service and try again. Saved work is unaffected.",
      );
    }
  });

  return router;
}
