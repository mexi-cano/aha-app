import {
  MAX_CREW_MEMBERS,
  jobSchema,
  type Job,
  type JobWorker,
} from "@workspace/aha-domain";

export interface JobSetupDraft {
  name: string;
  cityLabel: string;
  location: string;
  closestEmergencyCentre: string;
  emergencyNumber: string;
  musterPoint: string;
  workOrderPermit: string;
  jhaProcedureNumbers: string;
  roster: JobWorker[];
  personInChargeMode: "worker" | "custom";
  personInChargeWorkerId: string | null;
  customPersonInCharge: string;
}

export type JobSetupField =
  | "name"
  | "cityLabel"
  | "location"
  | "closestEmergencyCentre"
  | "emergencyNumber"
  | "musterPoint"
  | "personInCharge"
  | "roster";

export interface JobSetupIssue {
  field: JobSetupField;
  message: string;
}

export function createEmptyJobSetupDraft(): JobSetupDraft {
  return {
    name: "",
    cityLabel: "",
    location: "",
    closestEmergencyCentre: "",
    emergencyNumber: "",
    musterPoint: "",
    workOrderPermit: "",
    jhaProcedureNumbers: "",
    roster: [],
    personInChargeMode: "custom",
    personInChargeWorkerId: null,
    customPersonInCharge: "",
  };
}

export function jobToSetupDraft(job: Job): JobSetupDraft {
  const associatedWorker = job.roster.find(
    ({ id }) => id === job.defaultPersonInChargeWorkerId,
  );
  return {
    name: job.name,
    cityLabel: job.cityLabel,
    location: job.defaults.location,
    closestEmergencyCentre: job.defaults.closestEmergencyCentre,
    emergencyNumber: job.defaults.emergencyNumber,
    musterPoint: job.defaults.musterPoint,
    workOrderPermit: job.defaults.workOrderPermit,
    jhaProcedureNumbers: job.defaults.jhaProcedureNumbers,
    roster: job.roster.map((worker) => ({ ...worker })),
    personInChargeMode: associatedWorker ? "worker" : "custom",
    personInChargeWorkerId: associatedWorker?.id ?? null,
    customPersonInCharge: associatedWorker ? "" : job.defaults.personInCharge,
  };
}

export function validateJobSetup(draft: JobSetupDraft): JobSetupIssue[] {
  const issues: JobSetupIssue[] = [];
  const required: Array<
    [Exclude<JobSetupField, "personInCharge" | "roster">, string, string]
  > = [
    ["name", draft.name, "Enter the job name."],
    ["cityLabel", draft.cityLabel, "Enter the city or area."],
    ["location", draft.location, "Enter the default work location."],
    [
      "closestEmergencyCentre",
      draft.closestEmergencyCentre,
      "Enter the closest emergency centre.",
    ],
    ["emergencyNumber", draft.emergencyNumber, "Enter an emergency number."],
    ["musterPoint", draft.musterPoint, "Enter the muster point."],
  ];
  for (const [field, value, message] of required) {
    if (!value.trim()) issues.push({ field, message });
  }

  if (draft.roster.length > MAX_CREW_MEMBERS) {
    issues.push({
      field: "roster",
      message: `A job roster can contain up to ${MAX_CREW_MEMBERS} workers.`,
    });
  }
  if (draft.roster.some(({ name }) => !name.trim())) {
    issues.push({ field: "roster", message: "Worker names cannot be blank." });
  }
  if (new Set(draft.roster.map(({ id }) => id)).size !== draft.roster.length) {
    issues.push({ field: "roster", message: "Worker IDs must be unique." });
  }

  if (draft.personInChargeMode === "worker") {
    if (
      !draft.personInChargeWorkerId ||
      !draft.roster.some(({ id }) => id === draft.personInChargeWorkerId)
    ) {
      issues.push({
        field: "personInCharge",
        message: "Choose the default Person in charge.",
      });
    }
  } else if (!draft.customPersonInCharge.trim()) {
    issues.push({
      field: "personInCharge",
      message: "Enter the default Person in charge.",
    });
  }
  return issues;
}

export function getVisibleJobSetupIssues(
  draft: JobSetupDraft,
  hasAttemptedSubmit: boolean,
): JobSetupIssue[] {
  return hasAttemptedSubmit ? validateJobSetup(draft) : [];
}

export function buildJobConfiguration(draft: JobSetupDraft): Omit<Job, "id"> {
  const issues = validateJobSetup(draft);
  if (issues.length) {
    throw new Error("Job setup is incomplete.");
  }
  const worker = draft.roster.find(
    ({ id }) => id === draft.personInChargeWorkerId,
  );
  const parsed = jobSchema.parse({
    id: "job-setup-validation",
    name: draft.name,
    cityLabel: draft.cityLabel,
    defaults: {
      location: draft.location,
      personInCharge:
        draft.personInChargeMode === "worker"
          ? worker!.name
          : draft.customPersonInCharge,
      closestEmergencyCentre: draft.closestEmergencyCentre,
      emergencyNumber: draft.emergencyNumber,
      musterPoint: draft.musterPoint,
      workOrderPermit: draft.workOrderPermit,
      jhaProcedureNumbers: draft.jhaProcedureNumbers,
    },
    roster: draft.roster,
    defaultPersonInChargeWorkerId:
      draft.personInChargeMode === "worker" ? worker!.id : null,
  });
  return {
    name: parsed.name,
    cityLabel: parsed.cityLabel,
    defaults: parsed.defaults,
    roster: parsed.roster,
    defaultPersonInChargeWorkerId: parsed.defaultPersonInChargeWorkerId,
  };
}
