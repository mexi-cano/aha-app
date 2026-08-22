import type { Aha, Job } from "@workspace/aha-domain";

import {
  analyzeAhaPdfFit,
  saveAhaAndGeneratePdf,
  type CriticalAhaCommit,
  type PdfFitIssue,
  type SavedPdfOperationResult,
} from "@/pdf";

export type CompletedSignatureOperationResult =
  | { status: "candidate_failed"; cause: unknown }
  | { status: "candidate_fit_failed"; issues: PdfFitIssue[] }
  | SavedPdfOperationResult;

interface CompletedSignatureOperationOptions {
  aha: Aha;
  job: Job;
  commitAha: CriticalAhaCommit;
  update: (current: Aha) => Aha;
}

export async function runCompletedSignatureOperation({
  aha,
  job,
  commitAha,
  update,
}: CompletedSignatureOperationOptions): Promise<CompletedSignatureOperationResult> {
  let candidate: Aha;
  try {
    candidate = update(aha);
  } catch (cause) {
    return { status: "candidate_failed", cause };
  }
  try {
    const fit = await analyzeAhaPdfFit(candidate, job);
    if (fit.issues.length > 0) {
      return { status: "candidate_fit_failed", issues: fit.issues };
    }
  } catch (cause) {
    return { status: "candidate_failed", cause };
  }
  return saveAhaAndGeneratePdf({ commitAha, update, job });
}
