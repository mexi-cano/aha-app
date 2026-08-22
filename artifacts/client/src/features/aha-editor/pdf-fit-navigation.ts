import type { Aha } from "@workspace/aha-domain";

import type { PdfFitIssue } from "@/pdf";

function excerpt(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > 72 ? `${normalized.slice(0, 69)}…` : normalized;
}

export function describePdfFitIssue(issue: PdfFitIssue, aha: Aha): string {
  if (!issue.taskId) return issue.message;
  const task = aha.tasks.find(({ id }) => id === issue.taskId);
  const field = issue.fieldPath.split(".").at(-1);
  const value =
    field === "task"
      ? task?.task
      : field === "hazards"
        ? task?.hazards
        : field === "controls"
          ? task?.controls
          : task?.task;
  const valueExcerpt = value ? excerpt(value) : "this task";
  return `${issue.label} “${valueExcerpt}” won't fit on the ITS sheet. Shorten it or split the work.`;
}

export function pdfFitIssueEditorPath(
  ahaId: string,
  issue: PdfFitIssue,
): string {
  if (issue.taskId) {
    const field = issue.fieldPath.split(".").at(-1);
    const params = new URLSearchParams({
      task: issue.taskId,
      field: field === "hazards" || field === "controls" ? field : "task",
    });
    return `/ahas/${ahaId}/work?${params.toString()}`;
  }
  if (issue.fieldPath === "meetingNotes" || issue.fieldPath === "tasks") {
    return `/ahas/${ahaId}/work`;
  }
  if (issue.fieldPath.startsWith("crew.")) {
    return `/ahas/${ahaId}/review?focus=crew`;
  }
  const detailFocus: Record<string, string> = {
    location: "location",
    personInCharge: "person-in-charge",
    emergencyNumber: "emergency-number",
    closestEmergencyCentre: "closest-emergency-centre",
    workOrderPermit: "work-order-permit",
    jhaProcedureNumbers: "jha-procedure-numbers",
    musterPoint: "muster-point",
    description: "work-description",
  };
  const focus = detailFocus[issue.fieldPath];
  return focus
    ? `/ahas/${ahaId}/details?focus=${focus}`
    : `/ahas/${ahaId}/work`;
}
