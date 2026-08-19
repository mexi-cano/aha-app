import type { Aha, Job } from "@workspace/aha-domain";

import { PDF_FAILURE_MESSAGE } from "./pdf-constants";
import { generateAndStoreAhaPdf, type StoredPdfResult } from "./pdf-service";

export type CriticalAhaCommit = (
  update: (current: Aha) => Aha,
) => Promise<Aha | null>;

export type SavedPdfOperationResult =
  | { status: "save_failed" }
  | {
      status: "stored";
      savedAha: Aha;
      record: Extract<StoredPdfResult, { status: "stored" }>["record"];
    }
  | {
      status: "fit_failed";
      savedAha: Aha;
      issues: Extract<StoredPdfResult, { status: "fit_failed" }>["issues"];
    }
  | {
      status: "generation_failed";
      savedAha: Aha;
      message: string;
      cause: unknown;
    };

interface SavedPdfOperationOptions {
  commitAha: CriticalAhaCommit;
  update: (current: Aha) => Aha;
  job: Job;
  generate?: (savedAha: Aha, job: Job) => Promise<StoredPdfResult>;
}

function logDevelopmentFailure(message: string, cause: unknown): void {
  if (!import.meta.env?.DEV) return;

  console.error(message, {
    name:
      typeof cause === "object" &&
      cause !== null &&
      "name" in cause &&
      typeof cause.name === "string"
        ? cause.name
        : "UnknownError",
    stack:
      typeof cause === "object" &&
      cause !== null &&
      "stack" in cause &&
      typeof cause.stack === "string"
        ? cause.stack
        : undefined,
  });
}

export async function saveAhaAndGeneratePdf({
  commitAha,
  update,
  job,
  generate = generateAndStoreAhaPdf,
}: SavedPdfOperationOptions): Promise<SavedPdfOperationResult> {
  let savedAha: Aha | null;
  try {
    savedAha = await commitAha(update);
  } catch (cause) {
    logDevelopmentFailure("AHA persistence failed", cause);
    return { status: "save_failed" };
  }
  if (!savedAha) return { status: "save_failed" };

  let result: StoredPdfResult;
  try {
    result = await generate(savedAha, job);
  } catch (cause) {
    logDevelopmentFailure("PDF generation failed", cause);
    return {
      status: "generation_failed",
      savedAha,
      message: PDF_FAILURE_MESSAGE,
      cause,
    };
  }
  if (result.status === "stored") {
    return { status: "stored", savedAha, record: result.record };
  }
  if (result.status === "fit_failed") {
    return { status: "fit_failed", savedAha, issues: result.issues };
  }
  logDevelopmentFailure("PDF generation failed", result.cause);
  return {
    status: "generation_failed",
    savedAha,
    message: result.message,
    cause: result.cause,
  };
}
