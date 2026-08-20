import type { RequestHandler } from "express";

import {
  getAuthConfigFromEnv,
  verifyAccessToken,
  type AuthConfig,
} from "../lib/auth";
import { sendProblem } from "../lib/problem";

export function requireBearerToken(
  getConfig: () => AuthConfig = getAuthConfigFromEnv,
): RequestHandler {
  return (request, response, next) => {
    const authorization = request.get("authorization") ?? "";
    const token = /^Bearer[\t ]+([^\t ]+)[\t ]*$/i.exec(authorization)?.[1];
    try {
      if (!token || !verifyAccessToken(token, getConfig())) {
        sendProblem(
          response,
          401,
          "authentication-required",
          "Access code required",
          "Enter the crew access code to resume backup.",
        );
        return;
      }
      next();
    } catch (error) {
      request.log.error(
        { err: error instanceof Error ? { name: error.name } : undefined },
        "Authentication configuration unavailable",
      );
      sendProblem(
        response,
        503,
        "authentication-unavailable",
        "Backup is temporarily unavailable",
        "Saved work on this iPad is unaffected. Try again later.",
      );
    }
  };
}
