import { z } from "zod";

import {
  ENERGY_CATEGORIES,
  ENERGY_CATEGORY_NAMES,
  MAX_CREW_MEMBERS,
  MAX_TASKS,
} from "./canonical";

export const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a local YYYY-MM-DD date")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(year!, month! - 1, day!);
    return (
      parsed.getFullYear() === year &&
      parsed.getMonth() === month! - 1 &&
      parsed.getDate() === day
    );
  }, "Expected a real local calendar date");

export type LocalDate = z.infer<typeof localDateSchema>;

export const jobWorkerSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
});

export const jobDefaultsSchema = z.object({
  location: z.string(),
  personInCharge: z.string(),
  closestEmergencyCentre: z.string(),
  emergencyNumber: z.string(),
  musterPoint: z.string(),
  workOrderPermit: z.string(),
  jhaProcedureNumbers: z.string(),
});

export const jobSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  cityLabel: z.string(),
  defaults: jobDefaultsSchema,
  roster: z.array(jobWorkerSchema).max(MAX_CREW_MEMBERS),
});

export type Job = z.infer<typeof jobSchema>;

export const ahaStatusSchema = z.enum(["draft", "in_progress", "completed"]);

export type AhaStatus = z.infer<typeof ahaStatusSchema>;

export const ahaHeaderSchema = z.object({
  location: z.string(),
  date: localDateSchema,
  personInCharge: z.string(),
  closestEmergencyCentre: z.string(),
  emergencyNumber: z.string(),
  musterPoint: z.string(),
  workOrderPermit: z.string(),
  jhaProcedureNumbers: z.string(),
  rescuePlanRequired: z.boolean().nullable(),
});

export const ahaTaskSchema = z.object({
  id: z.string().min(1),
  task: z.string(),
  hazards: z.string(),
  controls: z.string(),
});

export type AhaTask = z.infer<typeof ahaTaskSchema>;

const canonicalExamples = new Map(
  ENERGY_CATEGORIES.map(({ category, examples }) => [
    category,
    new Set<string>(examples),
  ]),
);

export const energySelectionSchema = z
  .object({
    category: z.enum(ENERGY_CATEGORY_NAMES),
    examples: z.array(z.string()),
  })
  .superRefine(({ category, examples }, context) => {
    const allowed = canonicalExamples.get(category);
    for (const [index, example] of examples.entries()) {
      if (!allowed?.has(example)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Non-canonical ${category} example`,
          path: ["examples", index],
        });
      }
    }

    if (new Set(examples).size !== examples.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate ${category} example`,
        path: ["examples"],
      });
    }

    const canonicalOrder: readonly string[] = ENERGY_CATEGORIES.find(
      (entry) => entry.category === category,
    )!.examples;
    const positions = examples.map((example) =>
      canonicalOrder.indexOf(example),
    );
    if (
      positions.some(
        (position, index) => index > 0 && position < positions[index - 1]!,
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Canonical ${category} example order must be preserved`,
        path: ["examples"],
      });
    }
  });

export type EnergySelection = z.infer<typeof energySelectionSchema>;

export const ahaCrewMemberSchema = z
  .object({
    workerId: z.string().min(1),
    name: z.string(),
    signaturePng: z.string().nullable(),
    signedAt: z.string().datetime().nullable(),
  })
  .superRefine(({ signaturePng, signedAt }, context) => {
    if ((signaturePng === null) !== (signedAt === null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Signature image and timestamp must be saved together",
        path: ["signedAt"],
      });
    }
  });

export type AhaCrewMember = z.infer<typeof ahaCrewMemberSchema>;

export const ahaSchema = z
  .object({
    id: z.string().min(1),
    jobId: z.string().min(1),
    date: localDateSchema,
    status: ahaStatusSchema,
    header: ahaHeaderSchema,
    description: z.string(),
    meetingNotes: z.string(),
    notApplicable: z.object({
      workOrderPermit: z.boolean(),
      jhaProcedureNumbers: z.boolean(),
      meetingNotes: z.boolean(),
    }),
    tasks: z.array(ahaTaskSchema).max(MAX_TASKS),
    energySelections: z
      .array(energySelectionSchema)
      .max(ENERGY_CATEGORIES.length),
    safetyCheck: z.enum(["yes", "no"]).nullable(),
    crew: z.array(ahaCrewMemberSchema).max(MAX_CREW_MEMBERS),
    completedAt: z.string().datetime().nullable(),
    updatedAfterCompletionAt: z.array(z.string().datetime()),
    sync: z.object({
      savedLocallyAt: z.string().datetime(),
      backedUpAt: z.string().datetime().nullable(),
    }),
  })
  .superRefine(({ date, header, energySelections, tasks, crew }, context) => {
    if (header.date !== date) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Header date must match the AHA date",
        path: ["header", "date"],
      });
    }

    const categories = energySelections.map(({ category }) => category);
    if (new Set(categories).size !== categories.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Each energy category may appear only once",
        path: ["energySelections"],
      });
    }

    const categoryPositions = categories.map((category) =>
      ENERGY_CATEGORY_NAMES.indexOf(category),
    );
    if (
      categoryPositions.some(
        (position, index) =>
          index > 0 && position < categoryPositions[index - 1]!,
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Canonical energy category order must be preserved",
        path: ["energySelections"],
      });
    }

    const taskIds = tasks.map(({ id }) => id);
    if (new Set(taskIds).size !== taskIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Task IDs must be unique",
        path: ["tasks"],
      });
    }

    const workerIds = crew.map(({ workerId }) => workerId);
    if (new Set(workerIds).size !== workerIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Worker IDs must be unique",
        path: ["crew"],
      });
    }
  });

export type Aha = z.infer<typeof ahaSchema>;

export function parseStoredAha(value: unknown): Aha {
  const result = ahaSchema.safeParse(value);
  if (!result.success) {
    throw new Error(
      "A saved AHA could not be read. Its local data has not been changed.",
      { cause: result.error },
    );
  }
  return result.data;
}

export function parseStoredJob(value: unknown): Job {
  const result = jobSchema.safeParse(value);
  if (!result.success) {
    throw new Error(
      "A saved job could not be read. Its local data has not been changed.",
      { cause: result.error },
    );
  }
  return result.data;
}
