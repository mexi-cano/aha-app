import {
  ENERGY_CATEGORIES,
  ENERGY_CATEGORY_NAMES,
  MAX_CREW_MEMBERS,
  type EnergyCategoryName,
} from "./canonical";
import type {
  Aha,
  AhaCrewMember,
  AhaDocumentEvent,
  AhaDocumentEventReason,
  JobWorker,
} from "./model";

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

function headerChanged(current: Aha, next: Aha): boolean {
  const fields = [
    "location",
    "date",
    "personInCharge",
    "closestEmergencyCentre",
    "emergencyNumber",
    "musterPoint",
    "workOrderPermit",
    "jhaProcedureNumbers",
    "rescuePlanRequired",
  ] as const;
  return fields.some((field) => current.header[field] !== next.header[field]);
}

function notApplicableChanged(current: Aha, next: Aha): boolean {
  return (
    current.notApplicable.workOrderPermit !==
      next.notApplicable.workOrderPermit ||
    current.notApplicable.jhaProcedureNumbers !==
      next.notApplicable.jhaProcedureNumbers ||
    current.notApplicable.meetingNotes !== next.notApplicable.meetingNotes
  );
}

function printedCrewChanged(current: Aha, next: Aha): boolean {
  if (current.crew.length !== next.crew.length) return true;
  return current.crew.some((member, index) => {
    const nextMember = next.crew[index];
    return (
      !nextMember ||
      member.workerId !== nextMember.workerId ||
      member.name !== nextMember.name ||
      member.signaturePng !== nextMember.signaturePng
    );
  });
}

export function hasPdfSourceChanged(current: Aha, next: Aha): boolean {
  return (
    hasNonCrewPdfSourceChanged(current, next) ||
    printedCrewChanged(current, next)
  );
}

export function hasNonCrewPdfSourceChanged(current: Aha, next: Aha): boolean {
  return (
    current.date !== next.date ||
    headerChanged(current, next) ||
    current.description !== next.description ||
    current.meetingNotes !== next.meetingNotes ||
    notApplicableChanged(current, next) ||
    tasksChanged(current, next) ||
    energyChanged(current, next) ||
    current.safetyCheck !== next.safetyCheck
  );
}

export function hasSafetySensitiveContentChanged(
  current: Aha,
  next: Aha,
): boolean {
  return (
    current.header.location !== next.header.location ||
    current.header.personInCharge !== next.header.personInCharge ||
    current.header.closestEmergencyCentre !==
      next.header.closestEmergencyCentre ||
    current.header.emergencyNumber !== next.header.emergencyNumber ||
    current.header.musterPoint !== next.header.musterPoint ||
    current.header.rescuePlanRequired !== next.header.rescuePlanRequired ||
    current.description !== next.description ||
    current.meetingNotes !== next.meetingNotes ||
    current.notApplicable.meetingNotes !== next.notApplicable.meetingNotes ||
    tasksChanged(current, next) ||
    energyChanged(current, next)
  );
}

export function applyInProgressEditRules(current: Aha, next: Aha): Aha {
  return applyAhaMutationRules(current, next);
}

export interface AhaMutationRuleOptions {
  recordCompletedUpdateAt?: Date;
  completedUpdateBaselineRevision?: number;
}

function completedUpdateId(aha: Aha, startedAt: Date): string {
  return `completed-update:${aha.id}:${startedAt.toISOString()}`;
}

export function applyAhaMutationRules(
  current: Aha,
  next: Aha,
  options: AhaMutationRuleOptions = {},
): Aha {
  let adjusted = next;
  const safetySensitiveChanged = hasSafetySensitiveContentChanged(
    current,
    next,
  );
  if (
    (current.status === "in_progress" || current.status === "completed") &&
    next.status === current.status &&
    safetySensitiveChanged
  ) {
    adjusted = { ...adjusted, safetyCheck: null };
  }

  const sourceChanged = hasPdfSourceChanged(current, adjusted);
  if (!sourceChanged) return adjusted;

  const shouldRecordCompletedUpdate =
    current.status === "completed" &&
    adjusted.status === "completed" &&
    options.recordCompletedUpdateAt !== undefined &&
    hasNonCrewPdfSourceChanged(current, adjusted);

  let pendingCompletedUpdate = adjusted.pendingCompletedUpdate;
  if (shouldRecordCompletedUpdate) {
    const startedAt = options.recordCompletedUpdateAt!;
    const existing = current.pendingCompletedUpdate;
    pendingCompletedUpdate = {
      id: existing?.id ?? completedUpdateId(current, startedAt),
      startedAt: existing?.startedAt ?? startedAt.toISOString(),
      baselineDocumentRevision:
        existing?.baselineDocumentRevision ??
        options.completedUpdateBaselineRevision ??
        current.documentRevision,
      kind:
        existing?.kind === "safety" || safetySensitiveChanged
          ? "safety"
          : "administrative",
      crewReviewConfirmation: safetySensitiveChanged
        ? null
        : (existing?.crewReviewConfirmation ?? null),
    };
  } else if (
    current.status === "completed" &&
    adjusted.status === "completed" &&
    current.pendingCompletedUpdate &&
    safetySensitiveChanged
  ) {
    pendingCompletedUpdate = {
      ...current.pendingCompletedUpdate,
      kind: "safety",
      crewReviewConfirmation: null,
    };
  }

  return {
    ...adjusted,
    documentRevision: current.documentRevision + 1,
    pendingCompletedUpdate,
    updatedAfterCompletionAt: shouldRecordCompletedUpdate
      ? [
          ...adjusted.updatedAfterCompletionAt,
          options.recordCompletedUpdateAt!.toISOString(),
        ]
      : adjusted.updatedAfterCompletionAt,
  };
}

function correctionEventId(
  aha: Aha,
  kind: AhaDocumentEvent["kind"],
  occurredAt: string,
  workerId?: string,
): string {
  return [kind, aha.id, workerId, occurredAt].filter(Boolean).join(":");
}

function correctionNote(note: string | null | undefined): string | null {
  const normalized = note?.trim() ?? "";
  if (normalized.length > 250) {
    throw new Error("Correction notes cannot exceed 250 characters");
  }
  return normalized || null;
}

function appendDocumentEvent(aha: Aha, event: AhaDocumentEvent): Aha {
  return aha.documentEvents.some(({ id }) => id === event.id)
    ? aha
    : { ...aha, documentEvents: [...aha.documentEvents, event] };
}

export function confirmCompletedCrewReview(aha: Aha, now: Date): Aha {
  if (
    aha.status !== "completed" ||
    aha.pendingCompletedUpdate?.kind !== "safety"
  ) {
    throw new Error("A safety-sensitive completed update is not pending");
  }
  if (aha.safetyCheck !== "yes") {
    throw new Error("The safety check must be answered Yes first");
  }
  return {
    ...aha,
    pendingCompletedUpdate: {
      ...aha.pendingCompletedUpdate,
      crewReviewConfirmation: {
        confirmedAt: now.toISOString(),
        personInChargeName: aha.header.personInCharge,
      },
    },
  };
}

export function finalizeCompletedUpdate(aha: Aha, now: Date): Aha {
  if (aha.status !== "completed" || !aha.pendingCompletedUpdate) {
    return aha;
  }
  const pending = aha.pendingCompletedUpdate;
  if (
    pending.kind === "safety" &&
    (aha.safetyCheck !== "yes" || !pending.crewReviewConfirmation)
  ) {
    throw new Error(
      "Safety-sensitive updates require the safety check and crew review confirmation",
    );
  }
  const event: AhaDocumentEvent = {
    id: pending.id,
    kind: pending.kind === "safety" ? "safety_update" : "administrative_update",
    reason:
      pending.kind === "safety"
        ? "work_conditions_changed"
        : "administrative_correction",
    note: null,
    occurredAt: now.toISOString(),
    fromDocumentRevision: pending.baselineDocumentRevision,
    toDocumentRevision: aha.documentRevision,
    affectedWorkers: [],
    crewReviewConfirmation: pending.crewReviewConfirmation,
  };
  return appendDocumentEvent({ ...aha, pendingCompletedUpdate: null }, event);
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

export function resolvePersonInChargeWorkerId(aha: Aha): string | null {
  return aha.personInChargeWorkerId !== null &&
    aha.crew.some(({ workerId }) => workerId === aha.personInChargeWorkerId)
    ? aha.personInChargeWorkerId
    : null;
}

export function selectPersonInChargeWorker(aha: Aha, workerId: string): Aha {
  const worker = aha.crew.find((member) => member.workerId === workerId);
  if (!worker) throw new Error("Crew member was not found");
  return {
    ...aha,
    personInChargeWorkerId: worker.workerId,
    header: { ...aha.header, personInCharge: worker.name },
  };
}

export function enterCustomPersonInCharge(aha: Aha, name: string): Aha {
  return {
    ...aha,
    personInChargeWorkerId: null,
    header: { ...aha.header, personInCharge: name },
  };
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
    personInChargeWorkerId:
      aha.personInChargeWorkerId === workerId
        ? null
        : aha.personInChargeWorkerId,
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
    header:
      aha.personInChargeWorkerId === workerId
        ? { ...aha.header, personInCharge: normalizedName }
        : aha.header,
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

export function addLateSignedCrewMember(
  aha: Aha,
  worker: JobWorker,
  signaturePng: string,
  now: Date,
): Aha {
  if (aha.status !== "completed") {
    throw new Error("Late workers can only be added to a completed AHA");
  }
  if (aha.pendingCompletedUpdate) {
    throw new Error("Finish the pending completed update first");
  }
  if (aha.crew.some((member) => member.workerId === worker.id)) {
    throw new Error("Crew member is already on this AHA");
  }
  if (aha.crew.length >= MAX_CREW_MEMBERS) {
    throw new Error("This AHA already has 10 signature slots");
  }
  assertPngDataUrl(signaturePng);
  const occurredAt = now.toISOString();
  const member = {
    ...normalizedWorker(worker),
    signaturePng,
    signedAt: occurredAt,
  };
  return appendDocumentEvent(
    {
      ...aha,
      crew: [...aha.crew, member],
    },
    {
      id: correctionEventId(aha, "late_worker_added", occurredAt, worker.id),
      kind: "late_worker_added",
      reason: "late_arrival",
      note: null,
      occurredAt,
      fromDocumentRevision: aha.documentRevision,
      toDocumentRevision: aha.documentRevision + 1,
      affectedWorkers: [{ workerId: worker.id, name: member.name }],
      crewReviewConfirmation: null,
    },
  );
}

export type SignatureReplacementReason = Extract<
  AhaDocumentEventReason,
  "wrong_person_signed" | "signature_unclear"
>;

export function replaceCompletedSignature(
  aha: Aha,
  workerId: string,
  signaturePng: string,
  reason: SignatureReplacementReason,
  note: string | null,
  now: Date,
): Aha {
  if (aha.status !== "completed") {
    throw new Error("Signatures can only be corrected on a completed AHA");
  }
  if (aha.pendingCompletedUpdate) {
    throw new Error("Finish the pending completed update first");
  }
  if (!getReviewReport(aha).canStartSigning) {
    throw new Error("Review items must be fixed before replacing a signature");
  }
  if (reason !== "wrong_person_signed" && reason !== "signature_unclear") {
    throw new Error("A valid signature replacement reason is required");
  }
  assertPngDataUrl(signaturePng);
  const member = aha.crew.find((candidate) => candidate.workerId === workerId);
  if (!member?.signaturePng || !member.signedAt) {
    throw new Error("A saved worker signature was not found");
  }
  const occurredAt = now.toISOString();
  return appendDocumentEvent(
    {
      ...aha,
      crew: aha.crew.map((candidate) =>
        candidate.workerId === workerId
          ? { ...candidate, signaturePng, signedAt: occurredAt }
          : candidate,
      ),
    },
    {
      id: correctionEventId(aha, "signature_replaced", occurredAt, workerId),
      kind: "signature_replaced",
      reason,
      note: correctionNote(note),
      occurredAt,
      fromDocumentRevision: aha.documentRevision,
      toDocumentRevision: aha.documentRevision + 1,
      affectedWorkers: [{ workerId, name: member.name }],
      crewReviewConfirmation: null,
    },
  );
}

export type CompletedWorkerRemovalReason = Extract<
  AhaDocumentEventReason,
  "worker_not_on_site" | "duplicate_entry" | "added_by_mistake"
>;

export function removeCompletedCrewMember(
  aha: Aha,
  workerId: string,
  reason: CompletedWorkerRemovalReason,
  note: string | null,
  now: Date,
): Aha {
  if (aha.status !== "completed") {
    throw new Error("Workers can only be corrected on a completed AHA");
  }
  if (aha.pendingCompletedUpdate) {
    throw new Error("Finish the pending completed update first");
  }
  if (aha.crew.length <= 1) {
    throw new Error("The final crew member cannot be removed");
  }
  if (
    reason !== "worker_not_on_site" &&
    reason !== "duplicate_entry" &&
    reason !== "added_by_mistake"
  ) {
    throw new Error("A valid worker removal reason is required");
  }
  const member = aha.crew.find((candidate) => candidate.workerId === workerId);
  if (!member) throw new Error("Crew member was not found");
  const occurredAt = now.toISOString();
  return appendDocumentEvent(
    {
      ...aha,
      crew: aha.crew.filter((candidate) => candidate.workerId !== workerId),
      personInChargeWorkerId:
        aha.personInChargeWorkerId === workerId
          ? null
          : aha.personInChargeWorkerId,
    },
    {
      id: correctionEventId(aha, "worker_removed", occurredAt, workerId),
      kind: "worker_removed",
      reason,
      note: correctionNote(note),
      occurredAt,
      fromDocumentRevision: aha.documentRevision,
      toDocumentRevision: aha.documentRevision + 1,
      affectedWorkers: [{ workerId, name: member.name }],
      crewReviewConfirmation: null,
    },
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
  const occurredAt = now.toISOString();
  return appendDocumentEvent(
    {
      ...aha,
      status: "completed",
      completedAt: occurredAt,
    },
    {
      id: correctionEventId(aha, "initial_completion", occurredAt),
      kind: "initial_completion",
      reason: "initial_completion",
      note: null,
      occurredAt,
      fromDocumentRevision: null,
      toDocumentRevision: aha.documentRevision,
      affectedWorkers: aha.crew.map(({ workerId, name }) => ({
        workerId,
        name,
      })),
      crewReviewConfirmation: null,
    },
  );
}

export function isCompletedAhaLocked(
  aha: Aha,
  availableAhas: readonly Aha[],
): boolean {
  return availableAhas.some(
    (candidate) =>
      candidate.id !== aha.id &&
      candidate.jobId === aha.jobId &&
      candidate.date > aha.date,
  );
}

export function countSignedCrew(aha: Aha): number {
  return aha.crew.filter(
    (member) => member.signaturePng !== null && member.signedAt !== null,
  ).length;
}
