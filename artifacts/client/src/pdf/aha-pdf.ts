import {
  ENERGY_CATEGORIES,
  SAFETY_GATE_INSTRUCTION,
  SAFETY_GATE_QUESTION,
  WORKER_ACKNOWLEDGMENT,
  type Aha,
  type EnergyCategoryName,
  type Job,
} from "@workspace/aha-domain";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFImage,
  type PDFFont,
  type PDFPage,
} from "@cantoo/pdf-lib";

import { PDF_FAILURE_MESSAGE } from "./pdf-constants";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const LEFT = 45;
const RIGHT = 567;
const MIDDLE = 306;
const MIN_FONT_SIZE = 5.4;

const COLORS = {
  bar: rgb(0.28, 0.33, 0.3),
  border: rgb(0.55, 0.55, 0.55),
  label: rgb(0.4, 0.4, 0.4),
  black: rgb(0.1, 0.1, 0.1),
  ink: rgb(0.08, 0.08, 0.35),
  highlight: rgb(1, 0.9, 0.15),
  white: rgb(1, 1, 1),
} as const;

export interface AhaPdfAssets {
  logoPng: Uint8Array;
  energyWheelPng: Uint8Array;
}

export interface AhaPdfInput {
  ahaId: string;
  sourceRevision: number;
  jobName: string;
  location: string;
  date: string;
  jhaProcedureNumbers: string;
  personInCharge: string;
  emergencyNumber: string;
  closestEmergencyCentre: string;
  rescuePlanRequired: boolean | null;
  workOrderPermit: string;
  musterPoint: string;
  description: string;
  tasks: Array<{
    id: string;
    task: string;
    hazards: string;
    controls: string;
  }>;
  meetingNotes: string;
  energySelections: Array<{
    category: EnergyCategoryName;
    examples: string[];
  }>;
  safetyCheck: "yes" | "no" | null;
  crew: Array<{
    workerId: string;
    name: string;
    signaturePng: string | null;
  }>;
}

export interface PdfFitIssue {
  code: "field_overflow" | "task_row_overflow";
  fieldPath: string;
  label: string;
  taskId?: string;
  message: string;
}

interface TextPlan {
  lines: string[];
  size: number;
}

interface TaskPlan {
  id: string;
  rowStart: number;
  rowSpan: number;
  task: TextPlan;
  hazards: TextPlan;
  controls: TextPlan;
}

export interface AhaPdfLayoutPlan {
  issues: PdfFitIssue[];
  fields: {
    location: TextPlan;
    date: TextPlan;
    jhaProcedureNumbers: TextPlan;
    personInCharge: TextPlan;
    emergencyNumber: TextPlan;
    closestEmergencyCentre: TextPlan;
    workOrderPermit: TextPlan;
    musterPoint: TextPlan;
    description: TextPlan;
    meetingNotes: TextPlan;
    crewNames: TextPlan[];
  };
  tasks: TaskPlan[];
}

export type AhaPdfRenderResult =
  | { status: "fit_failed"; issues: PdfFitIssue[] }
  | { status: "failed"; message: string; cause: unknown }
  | {
      status: "rendered";
      bytes: Uint8Array;
      filename: string;
      sourceRevision: number;
    };

export function createAhaPdfInput(aha: Aha, job: Job): AhaPdfInput {
  return {
    ahaId: aha.id,
    sourceRevision: aha.documentRevision,
    jobName: job.name,
    location: aha.header.location,
    date: formatPdfDate(aha.date),
    jhaProcedureNumbers: aha.notApplicable.jhaProcedureNumbers
      ? ""
      : aha.header.jhaProcedureNumbers,
    personInCharge: aha.header.personInCharge,
    emergencyNumber: aha.header.emergencyNumber,
    closestEmergencyCentre: aha.header.closestEmergencyCentre,
    rescuePlanRequired: aha.header.rescuePlanRequired,
    workOrderPermit: aha.notApplicable.workOrderPermit
      ? ""
      : aha.header.workOrderPermit,
    musterPoint: aha.header.musterPoint,
    description: aha.description,
    tasks: aha.tasks.map((task) => ({ ...task })),
    meetingNotes: aha.notApplicable.meetingNotes ? "" : aha.meetingNotes,
    energySelections: aha.energySelections.map((selection) => ({
      category: selection.category,
      examples: [...selection.examples],
    })),
    safetyCheck: aha.safetyCheck,
    crew: aha.crew.map(({ workerId, name, signaturePng }) => ({
      workerId,
      name,
      signaturePng,
    })),
  };
}

export function createAhaPdfFilename(jobName: string, date: string): string {
  const safeJobName = jobName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
  return `AHA_${safeJobName}_${date}.pdf`;
}

function formatPdfDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day}-${month}-${year}`;
}

function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function linePlan(
  text: string,
  font: PDFFont,
  maxWidth: number,
  initialSize: number,
): { plan: TextPlan; fits: boolean } {
  let size = initialSize;
  while (font.widthOfTextAtSize(text, size) > maxWidth && size > MIN_FONT_SIZE) {
    size = Math.max(MIN_FONT_SIZE, Number((size - 0.2).toFixed(1)));
  }
  return {
    plan: { lines: text ? [text] : [], size },
    fits: font.widthOfTextAtSize(text, size) <= maxWidth,
  };
}

function wrappedPlan(
  text: string,
  font: PDFFont,
  maxWidth: number,
  initialSize: number,
  maxLines: number,
): { plan: TextPlan; fits: boolean } {
  let size = initialSize;
  let lines = wrapText(text, font, size, maxWidth);
  while (
    (lines.length > maxLines ||
      lines.some((line) => font.widthOfTextAtSize(line, size) > maxWidth)) &&
    size > MIN_FONT_SIZE
  ) {
    size = Math.max(MIN_FONT_SIZE, Number((size - 0.3).toFixed(1)));
    lines = wrapText(text, font, size, maxWidth);
  }
  return {
    plan: { lines, size },
    fits:
      lines.length <= maxLines &&
      lines.every((line) => font.widthOfTextAtSize(line, size) <= maxWidth),
  };
}

function overflowIssue(
  fieldPath: string,
  label: string,
  taskId?: string,
): PdfFitIssue {
  return {
    code: "field_overflow",
    fieldPath,
    label,
    taskId,
    message: `${label} won't fit on the ITS sheet. Shorten it or split the work.`,
  };
}

function addFieldPlan(
  issues: PdfFitIssue[],
  fieldPath: string,
  label: string,
  result: { plan: TextPlan; fits: boolean },
): TextPlan {
  if (!result.fits) issues.push(overflowIssue(fieldPath, label));
  return result.plan;
}

function taskMinimumSpan(
  input: AhaPdfInput["tasks"][number],
  font: PDFFont,
  issues: PdfFitIssue[],
): number {
  const cells = [
    ["task", "Task", input.task, 159],
    ["hazards", "Hazards", input.hazards, 159],
    ["controls", "Controls", input.controls, 163],
  ] as const;
  let span = 1;
  for (const [field, label, text, width] of cells) {
    const atMinimum = wrapText(text, font, MIN_FONT_SIZE, width);
    const hasWideLine = atMinimum.some(
      (line) => font.widthOfTextAtSize(line, MIN_FONT_SIZE) > width,
    );
    if (hasWideLine || atMinimum.length > 5) {
      issues.push(overflowIssue(`tasks.${input.id}.${field}`, label, input.id));
    }
    if (atMinimum.length > 2) span = 2;
  }
  return span;
}

export function planAhaPdfLayout(
  input: AhaPdfInput,
  font: PDFFont,
): AhaPdfLayoutPlan {
  const issues: PdfFitIssue[] = [];
  const fields = {
    location: addFieldPlan(
      issues,
      "header.location",
      "Location",
      wrappedPlan(input.location, font, 417, 8.8, 2),
    ),
    date: addFieldPlan(
      issues,
      "date",
      "Date",
      linePlan(input.date, font, 150, 9),
    ),
    jhaProcedureNumbers: addFieldPlan(
      issues,
      "header.jhaProcedureNumbers",
      "JHA / procedure numbers",
      linePlan(input.jhaProcedureNumbers, font, 139, 8.5),
    ),
    personInCharge: addFieldPlan(
      issues,
      "header.personInCharge",
      "Person in charge",
      linePlan(input.personInCharge, font, 200, 9),
    ),
    emergencyNumber: addFieldPlan(
      issues,
      "header.emergencyNumber",
      "Emergency number",
      linePlan(input.emergencyNumber, font, 165, 8.5),
    ),
    closestEmergencyCentre: addFieldPlan(
      issues,
      "header.closestEmergencyCentre",
      "Closest emergency centre",
      wrappedPlan(input.closestEmergencyCentre, font, 241, 8, 1),
    ),
    workOrderPermit: addFieldPlan(
      issues,
      "header.workOrderPermit",
      "Work order / permit number",
      linePlan(input.workOrderPermit, font, 170, 9),
    ),
    musterPoint: addFieldPlan(
      issues,
      "header.musterPoint",
      "Muster point",
      linePlan(input.musterPoint, font, 193, 8.5),
    ),
    description: addFieldPlan(
      issues,
      "description",
      "Description of work",
      wrappedPlan(input.description, font, 510, 8.3, 3),
    ),
    meetingNotes: addFieldPlan(
      issues,
      "meetingNotes",
      "On-site meeting notes",
      wrappedPlan(input.meetingNotes, font, 510, 8, 2),
    ),
    crewNames: input.crew.map((member, index) =>
      addFieldPlan(
        issues,
        `crew.${index}.name`,
        `Worker name ${index + 1}`,
        linePlan(member.name, font, index < 5 ? 118 : 114, 8.5),
      ),
    ),
  };

  const minimumSpans = input.tasks.map((task) =>
    taskMinimumSpan(task, font, issues),
  );
  const minimumRows = minimumSpans.reduce((sum, span) => sum + span, 0);
  if (minimumRows > 15) {
    issues.push({
      code: "task_row_overflow",
      fieldPath: "tasks",
      label: "Tasks",
      message:
        "The task details need more than the 15 rows available on the ITS sheet. Shorten them or split the work.",
    });
  }

  const spans = [...minimumSpans];
  let remaining = Math.max(0, 15 - minimumRows);
  for (let index = 0; index < spans.length && remaining > 0; index += 1) {
    if (spans[index] === 1) {
      spans[index] = 2;
      remaining -= 1;
    }
  }

  let rowStart = 0;
  const tasks = input.tasks.map((task, index) => {
    const rowSpan = spans[index] ?? 1;
    const maxLines = rowSpan === 1 ? 2 : 5;
    const columns = [
      ["task", "Task", task.task, 159],
      ["hazards", "Hazards", task.hazards, 159],
      ["controls", "Controls", task.controls, 163],
    ] as const;
    const plans = columns.map(([field, label, text, width]) => {
      const result = wrappedPlan(text, font, width, 7.2, maxLines);
      if (!result.fits) {
        const path = `tasks.${task.id}.${field}`;
        if (!issues.some((issue) => issue.fieldPath === path)) {
          issues.push(overflowIssue(path, label, task.id));
        }
      }
      return result.plan;
    });
    const planned: TaskPlan = {
      id: task.id,
      rowStart,
      rowSpan,
      task: plans[0]!,
      hazards: plans[1]!,
      controls: plans[2]!,
    };
    rowStart += rowSpan;
    return planned;
  });

  return { issues, fields, tasks };
}

export async function analyzeAhaPdfFit(
  aha: Aha,
  job: Job,
): Promise<AhaPdfLayoutPlan> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  return planAhaPdfLayout(createAhaPdfInput(aha, job), font);
}

function topY(topDown: number): number {
  return PAGE_HEIGHT - topDown;
}

function drawHorizontal(
  page: PDFPage,
  x0: number,
  x1: number,
  y: number,
  thickness = 0.7,
): void {
  page.drawLine({
    start: { x: x0, y: topY(y) },
    end: { x: x1, y: topY(y) },
    thickness,
    color: COLORS.border,
  });
}

function drawVertical(
  page: PDFPage,
  x: number,
  y0: number,
  y1: number,
  thickness = 0.7,
): void {
  page.drawLine({
    start: { x, y: topY(y0) },
    end: { x, y: topY(y1) },
    thickness,
    color: COLORS.border,
  });
}

function drawBox(
  page: PDFPage,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  thickness = 0.8,
): void {
  page.drawRectangle({
    x: x0,
    y: topY(y1),
    width: x1 - x0,
    height: y1 - y0,
    borderWidth: thickness,
    borderColor: COLORS.border,
  });
}

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  baseline: number,
  font: PDFFont,
  size: number,
  color = COLORS.black,
): void {
  if (text) page.drawText(text, { x, y: topY(baseline), font, size, color });
}

function drawRightText(
  page: PDFPage,
  text: string,
  right: number,
  baseline: number,
  font: PDFFont,
  size: number,
  color = COLORS.black,
): void {
  drawText(
    page,
    text,
    right - font.widthOfTextAtSize(text, size),
    baseline,
    font,
    size,
    color,
  );
}

function drawLabel(
  page: PDFPage,
  text: string,
  x: number,
  baseline: number,
  font: PDFFont,
  size = 7.5,
): void {
  drawText(page, text, x, baseline, font, size, COLORS.label);
}

function drawPlan(
  page: PDFPage,
  plan: TextPlan,
  x: number,
  firstBaseline: number,
  lineHeight: number,
  font: PDFFont,
): void {
  plan.lines.forEach((line, index) =>
    drawText(
      page,
      line,
      x,
      firstBaseline + index * lineHeight,
      font,
      plan.size,
      COLORS.ink,
    ),
  );
}

interface CheckboxBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function drawCheckbox(
  page: PDFPage,
  x: number,
  baseline: number,
  size = 8,
): CheckboxBox {
  page.drawRectangle({
    x,
    y: topY(baseline),
    width: size,
    height: size,
    borderWidth: 0.8,
    borderColor: COLORS.black,
  });
  return { x0: x, y0: baseline - size, x1: x + size, y1: baseline };
}

function drawX(page: PDFPage, box: CheckboxBox): void {
  page.drawLine({
    start: { x: box.x0 + 1, y: topY(box.y0 + 1) },
    end: { x: box.x1 - 1, y: topY(box.y1 - 1) },
    thickness: 1.3,
    color: COLORS.ink,
  });
  page.drawLine({
    start: { x: box.x0 + 1, y: topY(box.y1 - 1) },
    end: { x: box.x1 - 1, y: topY(box.y0 + 1) },
    thickness: 1.3,
    color: COLORS.ink,
  });
}

function drawFrontPage(
  page: PDFPage,
  input: AhaPdfInput,
  plan: AhaPdfLayoutPlan,
  font: PDFFont,
  bold: PDFFont,
  logo: PDFImage,
): void {
  drawText(page, "Activity Hazard Analysis", LEFT, 58, bold, 19);
  page.drawImage(logo, { x: RIGHT - 128, y: topY(70), width: 128, height: 64 });
  const y0 = 88;
  const heights = [46, 30, 30, 32, 30, 50];
  const ys = [y0];
  heights.forEach((height) => ys.push(ys.at(-1)! + height));
  drawBox(page, LEFT, ys[0]!, RIGHT, ys[6]!);
  for (let index = 1; index < 6; index += 1)
    drawHorizontal(page, LEFT, RIGHT, ys[index]!);
  for (const index of [1, 2, 3, 4])
    drawVertical(page, MIDDLE, ys[index]!, ys[index + 1]!);
  drawLabel(page, "Location:", LEFT + 6, ys[0]! + 12, font);
  drawLabel(page, "Date (dd-mm-yyyy):", LEFT + 6, ys[1]! + 12, font);
  drawLabel(page, "JHA / procedure numbers:", MIDDLE + 6, ys[1]! + 12, font);
  drawLabel(page, "Person in charge:", LEFT + 6, ys[2]! + 12, font);
  drawLabel(page, "Emergency number:", MIDDLE + 6, ys[2]! + 12, font);
  drawLabel(page, "Closest emergency centre:", LEFT + 6, ys[3]! + 12, font);
  const rescueQuestion =
    "Is a rescue plan required for the work being performed?";
  drawText(page, rescueQuestion, MIDDLE + 6, ys[3]! + 13, font, 7.5);
  const questionEnd = MIDDLE + 6 + font.widthOfTextAtSize(rescueQuestion, 7.5);
  const rescueYes = drawCheckbox(page, questionEnd + 6, ys[3]! + 15);
  drawText(page, "Yes", questionEnd + 17, ys[3]! + 13, font, 7.5);
  const rescueNo = drawCheckbox(page, questionEnd + 34, ys[3]! + 15);
  drawText(page, "No", questionEnd + 45, ys[3]! + 13, font, 7.5);
  if (input.rescuePlanRequired !== null)
    drawX(page, input.rescuePlanRequired ? rescueYes : rescueNo);
  drawLabel(page, "Work order / permit number:", LEFT + 6, ys[4]! + 12, font);
  drawLabel(page, "Muster point:", MIDDLE + 6, ys[4]! + 12, font);
  drawLabel(
    page,
    "Description of work performed on site and activities happening in the vicinity of work area:",
    LEFT + 6,
    ys[5]! + 12,
    font,
  );
  drawPlan(page, plan.fields.location, LEFT + 95, ys[0]! + 13, 12, font);
  drawPlan(page, plan.fields.date, LEFT + 130, ys[1]! + 13, 12, font);
  drawPlan(
    page,
    plan.fields.jhaProcedureNumbers,
    MIDDLE + 116,
    ys[1]! + 13,
    12,
    font,
  );
  drawPlan(page, plan.fields.personInCharge, LEFT + 90, ys[2]! + 13, 12, font);
  drawPlan(
    page,
    plan.fields.emergencyNumber,
    MIDDLE + 90,
    ys[2]! + 13,
    12,
    font,
  );
  drawPlan(
    page,
    plan.fields.closestEmergencyCentre,
    LEFT + 10,
    ys[3]! + 24,
    9.5,
    font,
  );
  drawPlan(
    page,
    plan.fields.workOrderPermit,
    LEFT + 125,
    ys[4]! + 13,
    12,
    font,
  );
  drawPlan(page, plan.fields.musterPoint, MIDDLE + 62, ys[4]! + 13, 12, font);
  drawPlan(page, plan.fields.description, LEFT + 6, ys[5]! + 25, 11, font);

  const tableTop = 318;
  const headerHeight = 18;
  const rowHeight = 24;
  const tableBottom = tableTop + headerHeight + rowHeight * 15;
  page.drawRectangle({
    x: LEFT,
    y: topY(tableTop + headerHeight),
    width: RIGHT - LEFT,
    height: headerHeight,
    color: COLORS.bar,
  });
  drawText(page, "Task", LEFT + 6, tableTop + 13, bold, 9, COLORS.white);
  drawText(page, "Hazards", 224, tableTop + 13, bold, 9, COLORS.white);
  drawText(page, "Controls", 398, tableTop + 13, bold, 9, COLORS.white);
  drawBox(page, LEFT, tableTop + headerHeight, RIGHT, tableBottom);
  for (let row = 1; row < 15; row += 1)
    drawHorizontal(
      page,
      LEFT,
      RIGHT,
      tableTop + headerHeight + row * rowHeight,
      0.5,
    );
  drawVertical(page, 219, tableTop + headerHeight, tableBottom);
  drawVertical(page, 393, tableTop + headerHeight, tableBottom);
  plan.tasks.forEach((taskPlan) => {
    const firstBaseline =
      tableTop + headerHeight + taskPlan.rowStart * rowHeight + 11;
    drawPlan(page, taskPlan.task, LEFT + 5, firstBaseline, 8.8, font);
    drawPlan(page, taskPlan.hazards, 224, firstBaseline, 8.8, font);
    drawPlan(page, taskPlan.controls, 398, firstBaseline, 8.8, font);
  });
  const notesTop = tableBottom + 10;
  drawBox(page, LEFT, notesTop, RIGHT, notesTop + 46);
  drawLabel(
    page,
    "Specific instructions/items discussed during on-site meeting:",
    LEFT + 6,
    notesTop + 12,
    font,
  );
  drawPlan(page, plan.fields.meetingNotes, LEFT + 6, notesTop + 24, 10, font);
  drawRightText(
    page,
    "IS_F_222_EN.2203",
    RIGHT,
    notesTop + 58,
    font,
    6.5,
    COLORS.label,
  );
}

const ENERGY_ROWS = [
  [
    "Gravity",
    [],
    ["Excavation cave-in", "Falling or sliding materials/objects"],
    ["Slips/trips/falls", "Working at heights"],
    [],
  ],
  [
    "Motion",
    [],
    [
      "Wind",
      "Road/ground conditions",
      "Flying particles/debris",
      "Simultaneous operations",
    ],
    [
      "Watercourses",
      "Ergonomics",
      "Congestion",
      "Vehicles/vessels/mobile equipment",
    ],
    [],
  ],
  [
    "Mechanical",
    [],
    ["Tool/equipment nip points/pinch points", "Vibration"],
    ["Rotating equipment"],
    [],
  ],
  [
    "Electrical",
    [
      "Electrical equipment/lines - normal or abnormal condition (shock or arc flash)",
    ],
    ["Non-intrinsically safe tools/equipment", "Static electricity"],
    ["Induced voltage"],
    [],
  ],
  [
    "Pressure",
    [],
    ["Compressed cylinders", "Pressurized piping/hoses/equipment"],
    ["Tanks/vessels", "Pressure relief systems"],
    [],
  ],
  [
    "Sound",
    [],
    ["Tools/equipment", "Pressure relief systems"],
    ["Purging"],
    [],
  ],
  [
    "Radiation",
    [],
    ["Welding arc", "NDT/X-ray", "NORM"],
    ["Infrared scanners", "Sun"],
    [],
  ],
  [
    "Biological",
    [],
    ["Plants", "Insects", "Needles", "Reptiles", "Viruses"],
    ["Animals", "Mold", "Bloodborne pathogens", "Birds", "Bacteria"],
    [],
  ],
  [
    "Chemical",
    [],
    ["Flammable/combustible", "Toxic vapors/dusts/fibers/fumes"],
    ["Corrosive", "Skin/eye irritants"],
    [
      "Designated substances, pipeline contaminants, spills, suspect soils",
      "Reactive",
    ],
  ],
  [
    "Temperature",
    [],
    [
      "Cold surfaces (Nitrogen, LNG, propane)",
      "Hot surfaces (friction, heat sources)",
      "Hot emissions/vapors",
    ],
    ["Weather conditions", "Ignition sources"],
    [],
  ],
  [
    "Human factors",
    [],
    ["Knowledge/skill", "Risk tolerance", "Working alone", "Training"],
    ["Communication", "Fit for duty", "Deviation from plan"],
    [],
  ],
] as const satisfies ReadonlyArray<
  readonly [
    EnergyCategoryName,
    readonly string[],
    readonly string[],
    readonly string[],
    readonly string[],
  ]
>;

const WEDGES: Partial<Record<EnergyCategoryName, [number, number]>> = {
  Gravity: [72, 36],
  Motion: [36, 36],
  Mechanical: [0, 36],
  Electrical: [-36, 36],
  Pressure: [-72, 36],
  Sound: [-108, 36],
  Radiation: [-144, 36],
  Biological: [180, 36],
  Chemical: [144, 36],
  Temperature: [108, 36],
};

interface HighlightGeometry {
  rowRectangles: Map<EnergyCategoryName, [number, number]>;
  exampleRectangles: Map<string, [number, number, number]>;
  tableBottom: number;
}

function energyExampleKey(
  category: EnergyCategoryName,
  example: string,
): string {
  return `${category}\u0000${example}`;
}

function drawEnergyTable(
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
): HighlightGeometry {
  const x0 = 240;
  const x1 = RIGHT;
  const tableTop = 72;
  const headerHeight = 16;
  page.drawRectangle({
    x: x0,
    y: topY(tableTop + headerHeight),
    width: x1 - x0,
    height: headerHeight,
    color: COLORS.bar,
  });
  drawText(page, "Energy type", x0 + 5, tableTop + 11.5, bold, 8, COLORS.white);
  drawText(page, "Examples", x0 + 74, tableTop + 11.5, bold, 8, COLORS.white);
  const rowRectangles = new Map<EnergyCategoryName, [number, number]>();
  const exampleRectangles = new Map<string, [number, number, number]>();
  let y = tableTop + headerHeight;
  for (const [category, wideBefore, left, right, wideAfter] of ENERGY_ROWS) {
    const lines =
      wideBefore.length +
      Math.max(left.length, right.length) +
      wideAfter.length;
    const height = 7 + lines * 8;
    rowRectangles.set(category, [y, y + height]);
    drawText(page, category, x0 + 5, y + 10, bold, 7);
    let baseline = y + 10;
    const drawExample = (
      x: number,
      exampleBaseline: number,
      example: string,
    ) => {
      const text = `• ${example}`;
      drawText(page, text, x, exampleBaseline, font, 6.4);
      exampleRectangles.set(energyExampleKey(category, example), [
        x,
        exampleBaseline,
        font.widthOfTextAtSize(text, 6.4),
      ]);
    };
    for (const example of wideBefore) {
      drawExample(x0 + 78, baseline, example);
      baseline += 8;
    }
    let leftBaseline = baseline;
    for (const example of left) {
      drawExample(x0 + 78, leftBaseline, example);
      leftBaseline += 8;
    }
    let rightBaseline = baseline;
    for (const example of right) {
      drawExample(x0 + 210, rightBaseline, example);
      rightBaseline += 8;
    }
    baseline = Math.max(leftBaseline, rightBaseline);
    for (const example of wideAfter) {
      drawExample(x0 + 78, baseline, example);
      baseline += 8;
    }
    y += height;
    drawHorizontal(page, x0, x1, y, 0.5);
  }
  drawBox(page, x0, tableTop + headerHeight, x1, y);
  drawVertical(page, x0 + 70, tableTop + headerHeight, y, 0.5);
  return { rowRectangles, exampleRectangles, tableBottom: y };
}

function polygonPath(points: Array<[number, number]>): string {
  return points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x} ${y}`)
    .concat("Z")
    .join(" ");
}

function sectorPoints(
  innerRadius: number,
  outerRadius: number,
  start: number,
  extent: number,
): Array<[number, number]> {
  const steps = 12;
  const point = (radius: number, angle: number): [number, number] => {
    const radians = (angle * Math.PI) / 180;
    return [radius * Math.cos(radians), -radius * Math.sin(radians)];
  };
  const outer = Array.from({ length: steps + 1 }, (_, index) =>
    point(outerRadius, start + (extent * index) / steps),
  );
  if (innerRadius === 0) return [[0, 0], ...outer];
  const inner = Array.from({ length: steps + 1 }, (_, index) =>
    point(innerRadius, start + extent - (extent * index) / steps),
  );
  return [...outer, ...inner];
}

function drawEnergyHighlights(
  page: PDFPage,
  input: AhaPdfInput,
  geometry: HighlightGeometry,
): void {
  const centreX = 140;
  const centreY = 175;
  const wheelRadius = 95;
  for (const selection of input.energySelections) {
    const wedge = WEDGES[selection.category];
    if (wedge) {
      page.drawSvgPath(
        polygonPath(sectorPoints(0, 0.815 * wheelRadius, wedge[0], wedge[1])),
        {
          x: centreX,
          y: topY(centreY),
          color: COLORS.highlight,
          opacity: 0.38,
        },
      );
      page.drawSvgPath(
        polygonPath(
          sectorPoints(
            0.8425 * wheelRadius,
            0.9575 * wheelRadius,
            wedge[0],
            wedge[1],
          ),
        ),
        {
          x: centreX,
          y: topY(centreY),
          color: COLORS.highlight,
          opacity: 0.45,
        },
      );
    } else {
      page.drawEllipse({
        x: centreX,
        y: topY(centreY),
        xScale: 0.255 * wheelRadius,
        yScale: 0.255 * wheelRadius,
        color: COLORS.highlight,
        opacity: 0.38,
      });
    }
    const row = geometry.rowRectangles.get(selection.category);
    if (row)
      page.drawRectangle({
        x: 241,
        y: topY(row[1]) + 1,
        width: 68,
        height: row[1] - row[0] - 2,
        color: COLORS.highlight,
        opacity: 0.38,
      });
    for (const example of selection.examples) {
      const line = geometry.exampleRectangles.get(
        energyExampleKey(selection.category, example),
      );
      if (line)
        page.drawRectangle({
          x: line[0] - 1.5,
          y: topY(line[1]) - 2,
          width: line[2] + 3,
          height: 8.4,
          color: COLORS.highlight,
          opacity: 0.38,
        });
    }
  }
}

function decodeSignatureDataUrl(value: string): Uint8Array {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=\r\n]+)$/.exec(value);
  if (!match) throw new Error("A saved signature is not a readable PNG image.");
  try {
    const binary = atob(match[1]!.replace(/\s/g, ""));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch (cause) {
    throw new Error("A saved signature is not a readable PNG image.", {
      cause,
    });
  }
}

async function drawSignature(
  document: PDFDocument,
  page: PDFPage,
  signaturePng: string,
  x0: number,
  x1: number,
  rowTop: number,
  rowHeight: number,
): Promise<void> {
  const image = await document.embedPng(decodeSignatureDataUrl(signaturePng));
  const maxWidth = x1 - x0 - 8;
  const maxHeight = rowHeight - 6;
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  page.drawImage(image, {
    x: x0 + (x1 - x0 - width) / 2,
    y: topY(rowTop + (rowHeight + height) / 2),
    width,
    height,
  });
}

async function drawBackPage(
  document: PDFDocument,
  page: PDFPage,
  input: AhaPdfInput,
  plan: AhaPdfLayoutPlan,
  font: PDFFont,
  bold: PDFFont,
  wheel: PDFImage,
): Promise<void> {
  drawHorizontal(page, LEFT, RIGHT, 38, 0.9);
  drawText(page, "Energy wheel", LEFT, 54, bold, 12);
  drawHorizontal(page, LEFT, RIGHT, 60, 0.9);
  page.drawImage(wheel, { x: 45, y: topY(270), width: 190, height: 190 });
  const geometry = drawEnergyTable(page, font, bold);
  drawEnergyHighlights(page, input, geometry);
  const gateBaseline = geometry.tableBottom + 24;
  drawText(page, SAFETY_GATE_QUESTION, LEFT, gateBaseline, bold, 9);
  const questionEnd = LEFT + bold.widthOfTextAtSize(SAFETY_GATE_QUESTION, 9);
  const yesBox = drawCheckbox(page, questionEnd + 7, gateBaseline + 2);
  drawText(page, "Yes", questionEnd + 18, gateBaseline, font, 8);
  const noBox = drawCheckbox(page, questionEnd + 37, gateBaseline + 2);
  drawText(page, "No", questionEnd + 48, gateBaseline, font, 8);
  if (input.safetyCheck !== null)
    drawX(page, input.safetyCheck === "yes" ? yesBox : noBox);
  drawText(
    page,
    `(${SAFETY_GATE_INSTRUCTION.replace("'yes'", '"yes"')})`,
    LEFT,
    gateBaseline + 15,
    bold,
    9,
  );
  const signoffTop = gateBaseline + 32;
  drawHorizontal(page, LEFT, RIGHT, signoffTop, 0.9);
  drawText(page, "Worker/visitor sign off", LEFT, signoffTop + 16, bold, 11);
  drawHorizontal(page, LEFT, RIGHT, signoffTop + 23, 0.9);
  const reviewText =
    "All workers/visitors must review and sign this form prior to commencing work or upon arrival to the site and repeat process if there are any changes to tasks or site conditions.";
  let paragraphBaseline = signoffTop + 38;
  for (const line of wrapText(reviewText, font, 8, RIGHT - LEFT)) {
    drawText(page, line, LEFT, paragraphBaseline, font, 8);
    paragraphBaseline += 10;
  }
  paragraphBaseline += 4;
  const acknowledgment = `Worker/visitor: ${WORKER_ACKNOWLEDGMENT}`;
  for (const line of wrapText(acknowledgment, bold, 8, RIGHT - LEFT)) {
    drawText(page, line, LEFT, paragraphBaseline, bold, 8);
    paragraphBaseline += 10;
  }
  const tableTop = paragraphBaseline + 6;
  const headerHeight = 16;
  const rowHeight = 27;
  const tableBottom = tableTop + headerHeight + rowHeight * 5;
  page.drawRectangle({
    x: LEFT,
    y: topY(tableTop + headerHeight),
    width: RIGHT - LEFT,
    height: headerHeight,
    color: COLORS.bar,
  });
  drawText(
    page,
    "Worker/visit name",
    LEFT + 5,
    tableTop + 11,
    bold,
    7.5,
    COLORS.white,
  );
  drawText(
    page,
    "Worker/visitor signature",
    178,
    tableTop + 11,
    bold,
    7.5,
    COLORS.white,
  );
  drawText(
    page,
    "Worker/visit name",
    320,
    tableTop + 11,
    bold,
    7.5,
    COLORS.white,
  );
  drawText(
    page,
    "Worker/visitor signature",
    444,
    tableTop + 11,
    bold,
    7.5,
    COLORS.white,
  );
  drawBox(page, LEFT, tableTop + headerHeight, RIGHT, tableBottom);
  for (let row = 1; row < 5; row += 1)
    drawHorizontal(
      page,
      LEFT,
      RIGHT,
      tableTop + headerHeight + row * rowHeight,
      0.5,
    );
  for (const x of [173, 315, 439])
    drawVertical(page, x, tableTop + headerHeight, tableBottom, 0.5);
  for (let index = 0; index < input.crew.length; index += 1) {
    const member = input.crew[index]!;
    const row = index % 5;
    const rightSide = index >= 5;
    const rowTop = tableTop + headerHeight + row * rowHeight;
    drawPlan(
      page,
      plan.fields.crewNames[index]!,
      rightSide ? 320 : LEFT + 5,
      rowTop + 18,
      8.8,
      font,
    );
    if (member.signaturePng)
      await drawSignature(
        document,
        page,
        member.signaturePng,
        rightSide ? 439 : 173,
        rightSide ? RIGHT : 315,
        rowTop,
        rowHeight,
      );
  }
  drawRightText(
    page,
    "IS_F_222_EN.2203",
    RIGHT,
    tableBottom + 12,
    font,
    6.5,
    COLORS.label,
  );
}

export async function renderAhaPdf(
  aha: Aha,
  job: Job,
  assets: AhaPdfAssets,
): Promise<AhaPdfRenderResult> {
  const input = createAhaPdfInput(aha, job);
  try {
    const document = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);
    const bold = await document.embedFont(StandardFonts.HelveticaBold);
    const plan = planAhaPdfLayout(input, font);
    if (plan.issues.length > 0)
      return { status: "fit_failed", issues: plan.issues };
    const logo = await document.embedPng(assets.logoPng);
    const wheel = await document.embedPng(assets.energyWheelPng);
    const front = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const back = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawFrontPage(front, input, plan, font, bold, logo);
    await drawBackPage(document, back, input, plan, font, bold, wheel);
    return {
      status: "rendered",
      bytes: await document.save(),
      filename: createAhaPdfFilename(job.name, aha.date),
      sourceRevision: aha.documentRevision,
    };
  } catch (cause) {
    return { status: "failed", message: PDF_FAILURE_MESSAGE, cause };
  }
}

export function canonicalPdfEnergyRows(): typeof ENERGY_ROWS {
  return ENERGY_ROWS;
}

export function assertPdfEnergySourceIsCanonical(): void {
  for (const [category, ...groups] of ENERGY_ROWS) {
    const rendered = groups.flat();
    const canonical = ENERGY_CATEGORIES.find(
      (entry) => entry.category === category,
    )!.examples;
    if (
      rendered.length !== canonical.length ||
      rendered.some((example, index) => example !== canonical[index])
    ) {
      throw new Error(`PDF energy mapping for ${category} is not canonical`);
    }
  }
}
