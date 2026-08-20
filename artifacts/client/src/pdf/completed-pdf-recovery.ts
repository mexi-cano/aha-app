import type { PdfFitIssue } from "./aha-pdf";
import type { SavedPdfOperationResult } from "./saved-pdf-operation";

export interface CompletedPdfRecoveryState {
  kind: "pdf_fit_failed";
  issues: PdfFitIssue[];
}

interface CompletedNavigationOptions {
  replace: true;
  state?: CompletedPdfRecoveryState;
}

type CompletedNavigation = (
  path: string,
  options: CompletedNavigationOptions,
) => Promise<boolean>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPdfFitIssue(value: unknown): value is PdfFitIssue {
  if (!isRecord(value)) return false;
  return (
    (value.code === "field_overflow" || value.code === "task_row_overflow") &&
    typeof value.fieldPath === "string" &&
    value.fieldPath.length > 0 &&
    typeof value.label === "string" &&
    value.label.length > 0 &&
    typeof value.message === "string" &&
    value.message.length > 0 &&
    (value.taskId === undefined ||
      (typeof value.taskId === "string" && value.taskId.length > 0))
  );
}

export function createCompletedPdfRecoveryState(
  issues: PdfFitIssue[],
): CompletedPdfRecoveryState {
  return { kind: "pdf_fit_failed", issues: issues.map((issue) => ({ ...issue })) };
}

export function parseCompletedPdfRecoveryState(
  value: unknown,
): CompletedPdfRecoveryState | null {
  if (
    !isRecord(value) ||
    value.kind !== "pdf_fit_failed" ||
    !Array.isArray(value.issues) ||
    value.issues.length === 0 ||
    !value.issues.every(isPdfFitIssue)
  ) {
    return null;
  }
  return createCompletedPdfRecoveryState(value.issues);
}

export function pdfFitIssueUpdatePath(
  ahaId: string,
  issue: PdfFitIssue,
): string | null {
  const base = `/ahas/${ahaId}/update`;
  const detailsFocus: Record<string, string> = {
    "header.location": "location",
    "header.jhaProcedureNumbers": "jha-procedure-numbers",
    "header.personInCharge": "person-in-charge",
    "header.emergencyNumber": "emergency-number",
    "header.closestEmergencyCentre": "closest-emergency-centre",
    "header.workOrderPermit": "work-order-permit",
    "header.musterPoint": "muster-point",
    description: "work-description",
  };
  const detailFocus = detailsFocus[issue.fieldPath];
  if (detailFocus) return `${base}/details?focus=${detailFocus}`;
  if (issue.fieldPath === "meetingNotes") {
    return `${base}/work?focus=meeting-notes`;
  }
  if (issue.fieldPath === "tasks") return `${base}/work`;
  if (issue.taskId) {
    const field = issue.fieldPath.split(".").at(-1);
    if (field === "task" || field === "hazards" || field === "controls") {
      const params = new URLSearchParams({ task: issue.taskId, field });
      return `${base}/work?${params.toString()}`;
    }
  }
  return null;
}

export async function navigateAfterPersistedPdfOperation(
  result: Exclude<SavedPdfOperationResult, { status: "save_failed" }>,
  navigate: CompletedNavigation,
): Promise<boolean> {
  const options: CompletedNavigationOptions =
    result.status === "fit_failed"
      ? {
          replace: true,
          state: createCompletedPdfRecoveryState(result.issues),
        }
      : { replace: true };
  return navigate(`/ahas/${result.savedAha.id}/completed`, options);
}
