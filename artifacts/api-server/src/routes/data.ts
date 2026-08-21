import { createHash } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { ahaSchema, jobSchema } from "@workspace/aha-domain";
import { z } from "zod";

import {
  BackupConstraintError,
  createNeonBackupStore,
  InvalidCursorError,
  type BackupStore,
} from "../lib/backup-store";
import { sendProblem } from "../lib/problem";
import { requireBearerToken } from "../middlewares/auth";
import type { AuthConfig } from "../lib/auth";

const jobRequestSchema = z
  .object({
    job: jobSchema,
    clientUpdatedAt: z.string().datetime(),
  })
  .strict();
const listQuerySchema = z
  .object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  })
  .strict();
const pdfQuerySchema = z
  .object({
    filename: z.string().min(1).max(240),
    sourceRevision: z.coerce.number().int().nonnegative(),
    generatedAt: z.string().datetime(),
  })
  .strict();
const pdfVersionParamsSchema = z.object({
  ahaId: z.string().min(1),
  sourceRevision: z.coerce.number().int().nonnegative(),
});
const pdfVersionQuerySchema = z
  .object({ generatedAt: z.string().datetime() })
  .strict();

function pdfMetadata(record: {
  ahaId: string;
  filename: string;
  sourceRevision: number;
  generatedAt: string;
  bytes: Buffer;
  sha256: string;
  backedUpAt: string;
}) {
  return {
    ahaId: record.ahaId,
    filename: record.filename,
    sourceRevision: record.sourceRevision,
    generatedAt: record.generatedAt,
    byteLength: record.bytes.byteLength,
    sha256: record.sha256,
    backedUpAt: record.backedUpAt,
  };
}

function sendPdf(
  response: Response,
  record: Parameters<typeof pdfMetadata>[0],
) {
  response
    .set({
      "X-AHA-Filename": encodeURIComponent(record.filename),
      "X-AHA-Source-Revision": String(record.sourceRevision),
      "X-AHA-Generated-At": record.generatedAt,
      "X-Content-SHA256": record.sha256,
      "Cache-Control": "no-store",
    })
    .type("application/pdf")
    .send(record.bytes);
}

function sendBackupWriteFailure(
  request: Request,
  response: Response,
  error: unknown,
  logMessage: string,
  fallbackDetail: string,
): void {
  if (error instanceof BackupConstraintError) {
    sendProblem(
      response,
      409,
      "backup-conflict",
      "Backup needs support",
      "The backup conflicts with an existing record and was not applied.",
    );
    return;
  }
  request.log.error(
    { err: error instanceof Error ? { name: error.name } : undefined },
    logMessage,
  );
  sendProblem(
    response,
    503,
    "backup-unavailable",
    "Backup unavailable",
    fallbackDetail,
  );
}

export function createDataRouter(
  store: BackupStore = createNeonBackupStore(),
  getAuthConfig?: () => AuthConfig,
): IRouter {
  const router: IRouter = Router();
  router.use(["/jobs", "/ahas"], requireBearerToken(getAuthConfig));

  router.get("/jobs", async (request, response) => {
    try {
      response.json(await store.listJobs());
    } catch (error) {
      request.log.error(
        { err: error instanceof Error ? { name: error.name } : undefined },
        "Job backup listing failed",
      );
      sendProblem(
        response,
        503,
        "backup-unavailable",
        "Backup unavailable",
        "Try again later.",
      );
    }
  });

  router.post("/jobs", async (request, response) => {
    const parsed = jobRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      sendProblem(
        response,
        400,
        "invalid-job",
        "Job not accepted",
        "The job backup is not valid.",
      );
      return;
    }
    try {
      response.json(
        await store.putJob(parsed.data.job, parsed.data.clientUpdatedAt),
      );
    } catch (error) {
      request.log.error(
        { err: error instanceof Error ? { name: error.name } : undefined },
        "Job backup failed",
      );
      sendProblem(
        response,
        503,
        "backup-unavailable",
        "Backup unavailable",
        "The job remains saved on the iPad. Try again later.",
      );
    }
  });

  router.get("/ahas", async (request, response) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      sendProblem(
        response,
        400,
        "invalid-restore-page",
        "Restore request not accepted",
        "The restore page request is invalid.",
      );
      return;
    }
    try {
      response.json(
        await store.listAhas(parsed.data.cursor ?? null, parsed.data.limit),
      );
    } catch (error) {
      if (error instanceof InvalidCursorError) {
        sendProblem(
          response,
          400,
          "invalid-restore-cursor",
          "Restore request not accepted",
          "The restore cursor is invalid.",
        );
        return;
      }
      request.log.error(
        { err: error instanceof Error ? { name: error.name } : undefined },
        "AHA backup listing failed",
      );
      sendProblem(
        response,
        503,
        "backup-unavailable",
        "Backup unavailable",
        "Try again later.",
      );
    }
  });

  const putAha = async (request: Request, response: Response) => {
    const parsed = ahaSchema.safeParse(request.body);
    if (
      !parsed.success ||
      (request.params.ahaId && request.params.ahaId !== parsed.data.id)
    ) {
      sendProblem(
        response,
        400,
        "invalid-aha",
        "AHA not accepted",
        "The AHA backup is not valid.",
      );
      return;
    }
    try {
      response.json(await store.putAha(parsed.data));
    } catch (error) {
      sendBackupWriteFailure(
        request,
        response,
        error,
        "AHA backup failed",
        "The AHA remains saved on the iPad. Try again later.",
      );
    }
  };
  router.post("/ahas", putAha);
  router.put("/ahas/:ahaId", putAha);

  router.get("/ahas/:ahaId/pdf", async (request, response) => {
    try {
      const record = await store.getPdf(request.params.ahaId!);
      if (!record) {
        sendProblem(
          response,
          404,
          "pdf-not-found",
          "PDF not found",
          "No PDF backup is available for this AHA.",
        );
        return;
      }
      sendPdf(response, record);
    } catch (error) {
      request.log.error(
        { err: error instanceof Error ? { name: error.name } : undefined },
        "PDF restore failed",
      );
      sendProblem(
        response,
        503,
        "backup-unavailable",
        "Backup unavailable",
        "Try again later.",
      );
    }
  });

  router.get("/ahas/:ahaId/pdf/versions", async (request, response) => {
    try {
      response.json(await store.listPdfVersions(request.params.ahaId!));
    } catch (error) {
      request.log.error(
        { err: error instanceof Error ? { name: error.name } : undefined },
        "PDF version listing failed",
      );
      sendProblem(
        response,
        503,
        "backup-unavailable",
        "Backup unavailable",
        "Try again later.",
      );
    }
  });

  router.get(
    "/ahas/:ahaId/pdf/versions/:sourceRevision",
    async (request, response) => {
      const params = pdfVersionParamsSchema.safeParse(request.params);
      const query = pdfVersionQuerySchema.safeParse(request.query);
      if (!params.success || !query.success) {
        sendProblem(
          response,
          400,
          "invalid-pdf-version",
          "PDF version not accepted",
          "The requested PDF version is invalid.",
        );
        return;
      }
      try {
        const record = await store.getPdfVersion(
          params.data.ahaId,
          params.data.sourceRevision,
          query.data.generatedAt,
        );
        if (!record) {
          sendProblem(
            response,
            404,
            "pdf-version-not-found",
            "PDF version not found",
            "That saved PDF version is not available.",
          );
          return;
        }
        sendPdf(response, record);
      } catch (error) {
        request.log.error(
          { err: error instanceof Error ? { name: error.name } : undefined },
          "PDF version restore failed",
        );
        sendProblem(
          response,
          503,
          "backup-unavailable",
          "Backup unavailable",
          "Try again later.",
        );
      }
    },
  );

  router.put("/ahas/:ahaId/pdf", async (request, response) => {
    const query = pdfQuerySchema.safeParse(request.query);
    const bytes = Buffer.isBuffer(request.body) ? request.body : null;
    if (
      !query.success ||
      !bytes ||
      bytes.length === 0 ||
      bytes.length > 5 * 1024 * 1024 ||
      bytes.subarray(0, 5).toString("ascii") !== "%PDF-"
    ) {
      sendProblem(
        response,
        400,
        "invalid-pdf",
        "PDF not accepted",
        "The PDF backup is not valid.",
      );
      return;
    }
    try {
      const result = await store.putPdf({
        ahaId: request.params.ahaId!,
        filename: query.data.filename,
        sourceRevision: query.data.sourceRevision,
        generatedAt: query.data.generatedAt,
        bytes,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
      response.json({
        accepted: result.accepted,
        isCurrent: result.isCurrent,
        record: pdfMetadata(result.record),
      });
    } catch (error) {
      sendBackupWriteFailure(
        request,
        response,
        error,
        "PDF backup failed",
        "The PDF remains saved on the iPad. Try again later.",
      );
    }
  });

  return router;
}
