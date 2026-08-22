import type { Aha, Job } from "@workspace/aha-domain";

import { analyzeAhaPdfFit, type PdfFitIssue } from "@/pdf";

export interface AhaPdfFitPreflight {
  ahaId: string;
  documentRevision: number;
  issues: PdfFitIssue[];
}

export async function runAhaPdfFitPreflight(
  aha: Aha,
  job: Job,
): Promise<AhaPdfFitPreflight> {
  const result = await analyzeAhaPdfFit(aha, job);
  return {
    ahaId: aha.id,
    documentRevision: aha.documentRevision,
    issues: result.issues,
  };
}

export function isCurrentAhaPdfFitPreflight(
  preflight: AhaPdfFitPreflight | null,
  aha: Pick<Aha, "id" | "documentRevision">,
): boolean {
  return (
    preflight?.ahaId === aha.id &&
    preflight.documentRevision === aha.documentRevision
  );
}
