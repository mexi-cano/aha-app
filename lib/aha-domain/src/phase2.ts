import {
  ENERGY_CATEGORIES,
  ENERGY_CATEGORY_NAMES,
  MAX_CREW_MEMBERS,
  type EnergyCategoryName,
} from "./canonical";
import type { Aha, AhaCrewMember, JobWorker } from "./model";

export type RequiredReviewTarget =
  | {
      section: "details";
      field:
        | "location"
        | "personInCharge"
        | "closestEmergencyCentre"
        | "emergencyNumber"
        | "musterPoint"
        | "rescuePlanRequired"
        | "description";
    }
  | {
      section: "task";
      taskId: string;
      field: "task" | "hazards" | "controls";
    }
  | { section: "energy"; field: "safetyCheck" }
  | { section: "crew"; field: "crew" };

export type WarningReviewTarget =
  | { section: "details"; field: "workOrderPermit" }
  | { section: "details"; field: "jhaProcedureNumbers" }
  | { section: "work"; field: "meetingNotes" };

export type ReviewIssue =
  | {
      tier: "must_fix";
      code:
        | "safety_check"
        | "rescue_plan"
        | "task_name"
        | "task_hazards"
        | "task_controls"
        | "crew_empty"
        | "description"
        | "location"
        | "person_in_charge"
        | "emergency_number"
        | "emergency_centre"
        | "muster_point";
      message: string;
      target: RequiredReviewTarget;
    }
  | {
      tier: "warning";
      code: "work_order_permit" | "jha_procedures" | "meeting_notes";
      message: string;
      target: WarningReviewTarget;
    };

export interface ReviewInformation {
  code: "task_count" | "energy_count" | "crew_count";
  count: number;
  message: string;
}

export interface ReviewReport {
  mustFix: Extract<ReviewIssue, { tier: "must_fix" }>[];
  warnings: Extract<ReviewIssue, { tier: "warning" }>[];
  information: ReviewInformation[];
  canStartSigning: boolean;
}

export interface EditorSectionReadiness {
  details: boolean;
  work: boolean;
  energy: boolean;
  review: boolean;
}

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

function canonicalCategoryPosition(category: EnergyCategoryName): number {
  return ENERGY_CATEGORY_NAMES.indexOf(category);
}

function canonicalExamplePosition(
  category: EnergyCategoryName,
  example: string,
): number {
  const canonicalExamples: readonly string[] = ENERGY_CATEGORIES.find(
    (entry) => entry.category === category,
  )!.examples;
  return canonicalExamples.indexOf(example);
}

function assertCanonicalExample(
  category: EnergyCategoryName,
  example: string,
): void {
  if (canonicalExamplePosition(category, example) < 0) {
    throw new Error(`Non-canonical ${category} example`);
  }
}

export function toggleEnergyCategory(
  aha: Aha,
  category: EnergyCategoryName,
): Aha {
  const selected = aha.energySelections.some(
    (selection) => selection.category === category,
  );
  const energySelections = selected
    ? aha.energySelections.filter(
        (selection) => selection.category !== category,
      )
    : [...aha.energySelections, { category, examples: [] }].sort(
        (left, right) =>
          canonicalCategoryPosition(left.category) -
          canonicalCategoryPosition(right.category),
      );

  return { ...aha, energySelections };
}

export function toggleEnergyExample(
  aha: Aha,
  category: EnergyCategoryName,
  example: string,
): Aha {
  assertCanonicalExample(category, example);

  const existing = aha.energySelections.find(
    (selection) => selection.category === category,
  );
  const examples = existing?.examples.includes(example)
    ? existing.examples.filter((candidate) => candidate !== example)
    : [...(existing?.examples ?? []), example].sort(
        (left, right) =>
          canonicalExamplePosition(category, left) -
          canonicalExamplePosition(category, right),
      );

  const energySelections = [
    ...aha.energySelections.filter(
      (selection) => selection.category !== category,
    ),
    { category, examples },
  ].sort(
    (left, right) =>
      canonicalCategoryPosition(left.category) -
      canonicalCategoryPosition(right.category),
  );

  return { ...aha, energySelections };
}

function tasksChanged(current: Aha, next: Aha): boolean {
  if (current.tasks.length !== next.tasks.length) return true;
  return current.tasks.some((task, index) => {
    const nextTask = next.tasks[index];
    return (
      !nextTask ||
      task.id !== nextTask.id ||
      task.task !== nextTask.task ||
      task.hazards !== nextTask.hazards ||
      task.controls !== nextTask.controls
    );
  });
}

function energyChanged(current: Aha, next: Aha): boolean {
  if (current.energySelections.length !== next.energySelections.length) {
    return true;
  }

  return current.energySelections.some((selection, index) => {
    const nextSelection = next.energySelections[index];
    return (
      !nextSelection ||
      selection.category !== nextSelection.category ||
      selection.examples.length !== nextSelection.examples.length ||
      selection.examples.some(
        (example, exampleIndex) =>
          example !== nextSelection.examples[exampleIndex],
      )
    );
  });
}

export function hasSafetySensitiveContentChanged(
  current: Aha,
  next: Aha,
): boolean {
  return (
    current.description !== next.description ||
    tasksChanged(current, next) ||
    energyChanged(current, next)
  );
}

export function applyInProgressEditRules(current: Aha, next: Aha): Aha {
  if (
    current.status === "in_progress" &&
    next.status === "in_progress" &&
    hasSafetySensitiveContentChanged(current, next)
  ) {
    return { ...next, safetyCheck: null };
  }
  return next;
}

export function getReviewReport(aha: Aha): ReviewReport {
  const mustFix: ReviewReport["mustFix"] = [];
  const warnings: ReviewReport["warnings"] = [];

  if (aha.safetyCheck !== "yes") {
    mustFix.push({
      tier: "must_fix",
      code: "safety_check",
      message: "Safety check must be answered Yes before signing.",
      target: { section: "energy", field: "safetyCheck" },
    });
  }
  if (aha.header.rescuePlanRequired === null) {
    mustFix.push({
      tier: "must_fix",
      code: "rescue_plan",
      message: "Choose whether a rescue plan is required.",
      target: { section: "details", field: "rescuePlanRequired" },
    });
  }

  const requiredHeaderFields = [
    ["location", "location", "Location is missing."],
    ["personInCharge", "person_in_charge", "Person in charge is missing."],
    [
      "closestEmergencyCentre",
      "emergency_centre",
      "Closest emergency centre is missing.",
    ],
    ["emergencyNumber", "emergency_number", "Emergency number is missing."],
    ["musterPoint", "muster_point", "Muster point is missing."],
  ] as const;

  for (const [field, code, message] of requiredHeaderFields) {
    if (isBlank(aha.header[field])) {
      mustFix.push({
        tier: "must_fix",
        code,
        message,
        target: { section: "details", field },
      });
    }
  }

  if (isBlank(aha.description)) {
    mustFix.push({
      tier: "must_fix",
      code: "description",
      message: "Description of work is missing.",
      target: { section: "details", field: "description" },
    });
  }

  for (const task of aha.tasks) {
    if (isBlank(task.task)) {
      mustFix.push({
        tier: "must_fix",
        code: "task_name",
        message: "Task description is missing.",
        target: { section: "task", taskId: task.id, field: "task" },
      });
    }
    if (isBlank(task.hazards)) {
      mustFix.push({
        tier: "must_fix",
        code: "task_hazards",
        message: "Hazards are missing for this task.",
        target: { section: "task", taskId: task.id, field: "hazards" },
      });
    }
    if (isBlank(task.controls)) {
      mustFix.push({
        tier: "must_fix",
        code: "task_controls",
        message: "Controls are missing for this task.",
        target: { section: "task", taskId: task.id, field: "controls" },
      });
    }
  }

  if (aha.crew.length === 0) {
    mustFix.push({
      tier: "must_fix",
      code: "crew_empty",
      message: "Add at least one crew member before signing.",
      target: { section: "crew", field: "crew" },
    });
  }

  if (
    isBlank(aha.header.workOrderPermit) &&
    !aha.notApplicable.workOrderPermit
  ) {
    warnings.push({
      tier: "warning",
      code: "work_order_permit",
      message: "No work order / permit number entered.",
      target: { section: "details", field: "workOrderPermit" },
    });
  }
  if (
    isBlank(aha.header.jhaProcedureNumbers) &&
    !aha.notApplicable.jhaProcedureNumbers
  ) {
    warnings.push({
      tier: "warning",
      code: "jha_procedures",
      message: "No JHA / procedure numbers entered.",
      target: { section: "details", field: "jhaProcedureNumbers" },
    });
  }
  if (isBlank(aha.meetingNotes) && !aha.notApplicable.meetingNotes) {
    warnings.push({
      tier: "warning",
      code: "meeting_notes",
      message: "No on-site meeting notes entered.",
      target: { section: "work", field: "meetingNotes" },
    });
  }

  const information: ReviewInformation[] = [
    {
      code: "task_count",
      count: aha.tasks.length,
      message: `${aha.tasks.length} ${aha.tasks.length === 1 ? "task" : "tasks"}`,
    },
    {
      code: "energy_count",
      count: aha.energySelections.length,
      message: `${aha.energySelections.length} of ${ENERGY_CATEGORIES.length} energy categories selected`,
    },
    {
      code: "crew_count",
      count: aha.crew.length,
      message: `${aha.crew.length} ${aha.crew.length === 1 ? "crew member" : "crew members"}`,
    },
  ];

  return {
    mustFix,
    warnings,
    information,
    canStartSigning: mustFix.length === 0,
  };
}

export function getEditorSectionReadiness(aha: Aha): EditorSectionReadiness {
  const report = getReviewReport(aha);
  const hasMustFix = (sections: RequiredReviewTarget["section"][]) =>
    report.mustFix.some((issue) => sections.includes(issue.target.section));

  return {
    details: !hasMustFix(["details"]),
    work: !hasMustFix(["task"]),
    energy: !hasMustFix(["energy"]),
    review: report.canStartSigning,
  };
}

export function canStartSigning(aha: Aha): boolean {
  return aha.status !== "completed" && getReviewReport(aha).canStartSigning;
}

export function canFinishAha(aha: Aha): boolean {
  return (
    aha.status === "in_progress" &&
    canStartSigning(aha) &&
    aha.crew.length > 0 &&
    aha.crew.every(
      (member) => member.signaturePng !== null && member.signedAt !== null,
    )
  );
}

export function beginSigning(aha: Aha): Aha {
  if (aha.status === "completed") {
    throw new Error("A completed AHA cannot enter signing mode");
  }
  if (!canStartSigning(aha)) {
    throw new Error("Review items must be fixed before signing");
  }
  return aha.status === "in_progress" ? aha : { ...aha, status: "in_progress" };
}

function normalizedWorker(member: JobWorker): AhaCrewMember {
  const name = member.name.trim();
  if (!member.id.trim()) throw new Error("Worker ID is required");
  if (!name) throw new Error("Worker name is required");
  return {
    workerId: member.id,
    name,
    signaturePng: null,
    signedAt: null,
  };
}

function assertCrewEditable(aha: Aha): void {
  if (aha.status === "completed") {
    throw new Error("A completed AHA cannot change its crew");
  }
}

export function addCrewMember(aha: Aha, worker: JobWorker): Aha {
  assertCrewEditable(aha);
  if (aha.crew.some((member) => member.workerId === worker.id)) return aha;
  if (aha.crew.length >= MAX_CREW_MEMBERS) {
    throw new Error("This AHA already has 10 signature slots");
  }
  return { ...aha, crew: [...aha.crew, normalizedWorker(worker)] };
}

export function removeCrewMember(aha: Aha, workerId: string): Aha {
  assertCrewEditable(aha);
  if (!aha.crew.some((member) => member.workerId === workerId)) {
    throw new Error("Crew member was not found");
  }
  return {
    ...aha,
    crew: aha.crew.filter((member) => member.workerId !== workerId),
  };
}

export function renameCrewMember(
  aha: Aha,
  workerId: string,
  name: string,
): Aha {
  assertCrewEditable(aha);
  const normalizedName = name.trim();
  if (!normalizedName) throw new Error("Worker name is required");
  if (!aha.crew.some((member) => member.workerId === workerId)) {
    throw new Error("Crew member was not found");
  }
  return {
    ...aha,
    crew: aha.crew.map((member) =>
      member.workerId === workerId
        ? {
            ...member,
            name: normalizedName,
            signaturePng: null,
            signedAt: null,
          }
        : member,
    ),
  };
}

function assertPngDataUrl(signaturePng: string): void {
  const prefix = "data:image/png;base64,";
  if (
    !signaturePng.startsWith(prefix) ||
    signaturePng.length <= prefix.length
  ) {
    throw new Error("A PNG signature is required");
  }
}

export function recordSignature(
  aha: Aha,
  workerId: string,
  signaturePng: string,
  now: Date,
): Aha {
  if (aha.status !== "in_progress") {
    throw new Error("Signing mode must be active before recording a signature");
  }
  if (!canStartSigning(aha)) {
    throw new Error("Review items must be fixed before recording a signature");
  }
  assertPngDataUrl(signaturePng);
  if (!aha.crew.some((member) => member.workerId === workerId)) {
    throw new Error("Crew member was not found");
  }
  const signedAt = now.toISOString();
  return {
    ...aha,
    crew: aha.crew.map((member) =>
      member.workerId === workerId
        ? { ...member, signaturePng, signedAt }
        : member,
    ),
  };
}

export function addSignedCrewMember(
  aha: Aha,
  worker: JobWorker,
  signaturePng: string,
  now: Date,
): Aha {
  return recordSignature(
    addCrewMember(aha, worker),
    worker.id,
    signaturePng,
    now,
  );
}

export function completeAha(aha: Aha, now: Date): Aha {
  if (aha.status !== "in_progress") {
    throw new Error("Signing must begin before the AHA can be completed");
  }
  if (!canFinishAha(aha)) {
    throw new Error(
      "Every crew member must sign and all must-fix items must pass",
    );
  }
  return {
    ...aha,
    status: "completed",
    completedAt: now.toISOString(),
  };
}

export function countSignedCrew(aha: Aha): number {
  return aha.crew.filter(
    (member) => member.signaturePng !== null && member.signedAt !== null,
  ).length;
}
