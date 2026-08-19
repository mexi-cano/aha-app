import type { ReviewIssue } from "@workspace/aha-domain";

export function reviewTargetPath(
  ahaId: string,
  target: ReviewIssue["target"],
): string {
  const base = `/ahas/${ahaId}`;

  if (target.section === "task") {
    const params = new URLSearchParams({
      task: target.taskId,
      field: target.field,
    });
    return `${base}/work?${params.toString()}`;
  }

  if (target.section === "energy") {
    return `${base}/energy?focus=safety-check`;
  }

  if (target.section === "crew") {
    return `${base}/review?focus=crew`;
  }

  if (target.section === "work") {
    return `${base}/work?focus=meeting-notes`;
  }

  const focusByField: Record<
    Extract<ReviewIssue["target"], { section: "details" }>["field"],
    string
  > = {
    location: "location",
    personInCharge: "person-in-charge",
    closestEmergencyCentre: "closest-emergency-centre",
    emergencyNumber: "emergency-number",
    musterPoint: "muster-point",
    rescuePlanRequired: "rescue-plan-yes",
    description: "work-description",
    workOrderPermit: "work-order-permit",
    jhaProcedureNumbers: "jha-procedure-numbers",
  };

  return `${base}/details?focus=${focusByField[target.field]}`;
}

export function scrollToAndFocus(id: string): void {
  requestAnimationFrame(() => {
    const element = document.getElementById(id);
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
    element?.focus({ preventScroll: true });
  });
}
