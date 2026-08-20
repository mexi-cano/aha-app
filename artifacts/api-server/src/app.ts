import express, { type Express } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { logger } from "./lib/logger";
import { sendProblem } from "./lib/problem";
import { createApiRouter } from "./routes";

export function shouldTrustPlatformProxy(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    environment.NODE_ENV === "production" || environment.REPL_ID !== undefined
  );
}

export function createApp(
  environment: NodeJS.ProcessEnv = process.env,
): Express {
  const app: Express = express();
  const isProduction = environment.NODE_ENV === "production";

  if (shouldTrustPlatformProxy(environment)) {
    // Replit terminates TLS at one trusted proxy hop in both preview and
    // production. Trust exactly that hop so per-IP rate limiting sees the
    // forwarded client address without accepting an arbitrary proxy chain.
    app.set("trust proxy", 1);
  }

  app.use(
    pinoHttp({
      logger,
      serializers: {
        req(req) {
          return {
            id: req.id,
            method: req.method,
            url: req.url?.split("?")[0],
          };
        },
        res(res) {
          return {
            statusCode: res.statusCode,
          };
        },
      },
    }),
  );
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "default-src": ["'self'"],
          "script-src": ["'self'"],
          "style-src": ["'self'", "'unsafe-inline'"],
          "img-src": ["'self'", "blob:", "data:"],
          "font-src": ["'self'"],
          "connect-src": ["'self'"],
          "frame-src": ["'self'", "blob:"],
          "worker-src": ["'self'", "blob:"],
          "object-src": ["'none'"],
        },
      },
    }),
  );
  app.use(
    cors({
      origin: isProduction ? false : true,
      methods: ["GET", "POST", "PUT", "OPTIONS"],
    }),
  );
  app.use(
    "/api/ahas/:ahaId/pdf",
    express.raw({ type: "application/pdf", limit: "5mb" }),
  );
  app.use("/api/auth", express.json({ limit: "4kb" }));
  app.use(express.json({ limit: "1mb" }));

  app.use("/api", createApiRouter());

  if (isProduction) {
    const clientDirectory =
      environment.CLIENT_DIST_PATH ??
      path.resolve(import.meta.dirname, "../../client/dist/public");
    const configuredBase = environment.BASE_PATH ?? "/";
    const basePath =
      configuredBase === "/"
        ? "/"
        : `/${configuredBase.replace(/^\/+|\/+$/g, "")}`;

    if (!existsSync(path.join(clientDirectory, "index.html"))) {
      throw new Error(`Built client not found at ${clientDirectory}.`);
    }

    app.use(
      basePath,
      express.static(clientDirectory, {
        index: false,
        setHeaders(response, filePath) {
          const filename = path.basename(filePath);
          if (
            filename === "index.html" ||
            filename === "manifest.webmanifest" ||
            filename === "sw.js" ||
            filename.startsWith("workbox-")
          ) {
            response.setHeader("Cache-Control", "no-cache");
          } else if (
            filePath.includes(`${path.sep}assets${path.sep}`) &&
            /-[A-Za-z0-9_-]{8,}\.[^.]+$/.test(filename)
          ) {
            response.setHeader(
              "Cache-Control",
              "public, max-age=31536000, immutable",
            );
          }
        },
      }),
    );

    app.use((request, response, next) => {
      if (
        request.method !== "GET" ||
        request.path.startsWith("/api/") ||
        (basePath !== "/" && !request.path.startsWith(`${basePath}/`)) ||
        !request.accepts("html")
      ) {
        next();
        return;
      }
      response.setHeader("Cache-Control", "no-cache");
      response.sendFile(path.join(clientDirectory, "index.html"));
    });
  }

  app.use((_request, response) => {
    sendProblem(
      response,
      404,
      "not-found",
      "Not found",
      "The requested resource was not found.",
    );
  });

  app.use(
    (
      error: unknown,
      request: express.Request,
      response: express.Response,
      next: express.NextFunction,
    ) => {
      if (response.headersSent) {
        next(error);
        return;
      }
      const failure = error as { type?: unknown; status?: unknown };
      if (failure.type === "entity.too.large" || failure.status === 413) {
        sendProblem(
          response,
          413,
          "request-too-large",
          "Request too large",
          "The request exceeds the allowed size.",
        );
        return;
      }
      if (failure.type === "entity.parse.failed" || failure.status === 400) {
        sendProblem(
          response,
          400,
          "invalid-request-body",
          "Request not accepted",
          "The request body is invalid.",
        );
        return;
      }
      request.log.error(
        { err: error instanceof Error ? { name: error.name } : undefined },
        "Unhandled request failure",
      );
      sendProblem(
        response,
        500,
        "request-failed",
        "Request failed",
        "The request could not be completed.",
      );
    },
  );

  return app;
}

const app = createApp();

export default app;
