import { useEffect, useState } from "react";
import {
  ahaSchema,
  jobSchema,
  type Aha,
  type Job,
} from "@workspace/aha-domain";

import referencePdfUrl from "../../../../assets/aha-clean-filled-sample.pdf?url";
import { renderAhaPdf } from "@/pdf/aha-pdf";
import { loadAhaPdfAssets } from "@/pdf/assets";

const job: Job = jobSchema.parse({
  id: "pdf-test-job",
  name: "I-40 Utility Relocation",
  cityLabel: "Raleigh, NC",
  defaults: {
    location: "",
    personInCharge: "",
    closestEmergencyCentre: "",
    emergencyNumber: "",
    musterPoint: "",
    workOrderPermit: "",
    jhaProcedureNumbers: "",
  },
  roster: [],
});

const crewNames = [
  "Miguel Rodriguez",
  "Juan Lopez",
  "David Garcia",
  "Chris Boone",
  "Terrell Whitaker",
  "Jose Martinez",
  "Roberto Diaz",
  "Luis Hernandez",
  "Sam Nguyen",
  "Alek Petrov",
];

function signatureFor(name: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = 360;
  canvas.height = 90;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");
  const seed = [...name].reduce(
    (sum, character) => sum + character.charCodeAt(0),
    0,
  );
  context.strokeStyle = "#1a238c";
  context.lineWidth = 4;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(12, 55);
  for (let index = 0; index < 5; index += 1) {
    const x = 18 + index * 62;
    const offset = ((seed >> index) & 7) - 3;
    context.bezierCurveTo(
      x + 16,
      20 + offset,
      x + 32,
      75 - offset,
      x + 60,
      48 + offset,
    );
  }
  context.stroke();
  return canvas.toDataURL("image/png");
}

function sampleAha(): Aha {
  const completedAt = "2026-08-14T11:52:00.000Z";
  return ahaSchema.parse({
    id: "pdf-test-aha",
    jobId: job.id,
    date: "2026-08-14",
    status: "completed",
    header: {
      location:
        "I-40 / Business 40 utility relocation - Sta. 114+50 to 128+00, EB shoulder near Exit 285, Raleigh, NC",
      date: "2026-08-14",
      personInCharge: "Miguel Rodriguez",
      closestEmergencyCentre: "WakeMed Raleigh Campus - 3000 New Bern Ave",
      emergencyNumber: "911 / Site safety: (919) 555-0182",
      musterPoint: "North parking lot, gate 3",
      workOrderPermit: "WO-88213 / Permit E-4471",
      jhaProcedureNumbers: "JHA-2026-0147, SOP-114, ITS-EXC-09",
      rescuePlanRequired: true,
    },
    description:
      "Excavation and directional bore for fiber conduit relocation along EB shoulder; potholing existing utilities; loading and hauling spoils. Adjacent lane closures with live traffic; paving crew working 200 ft east of Sta 126 (simultaneous operations).",
    tasks: [
      [
        "Excavation around existing utilities",
        "Cave-in, mobile equipment, underground utilities, slips/trips",
        "Daily excavation inspection, sloping/protective system, spotter, locates verified, barricades",
      ],
      [
        "Directional bore under roadway",
        "Rotating equipment, pinch points, hydraulic pressure, live traffic",
        "Machine guarding, two-person operation, cones/flagger, hands clear of rotating rod",
      ],
      [
        "Loading spoils / haul-off",
        "Overhead loads, mobile equipment, dust",
        "Exclusion zone, spotter, backup alarms verified, dust suppression, hard hats/hi-vis",
      ],
      [
        "Potholing / hand digging near gas main",
        "Line strike, flammable atmosphere",
        "Hand dig within 24 in of marks, gas monitor, no spark-producing tools, utility standby",
      ],
      [
        "Traffic control setup / teardown",
        "Live traffic, struck-by",
        "TTC per plan, taper per MUTCD, class 3 hi-vis, work behind barrier where possible",
      ],
      [
        "Housekeeping / demob",
        "Slips/trips, manual handling",
        "Clear walkways, team lifts over 50 lb, cut-resistant gloves",
      ],
    ].map(([task, hazards, controls], index) => ({
      id: `task-${index}`,
      task,
      hazards,
      controls,
    })),
    meetingNotes:
      "Reviewed lane closure timing with DOT inspector; paving crew east of Sta 126 - coordinate truck access; heat advisory after 1 PM - water/shade breaks every hour.",
    notApplicable: {
      workOrderPermit: false,
      jhaProcedureNumbers: false,
      meetingNotes: false,
    },
    energySelections: [
      {
        category: "Gravity",
        examples: [
          "Excavation cave-in",
          "Falling or sliding materials/objects",
          "Slips/trips/falls",
        ],
      },
      {
        category: "Motion",
        examples: ["Wind", "Ergonomics", "Vehicles/vessels/mobile equipment"],
      },
      {
        category: "Mechanical",
        examples: [
          "Tool/equipment nip points/pinch points",
          "Rotating equipment",
        ],
      },
      {
        category: "Electrical",
        examples: [
          "Electrical equipment/lines - normal or abnormal condition (shock or arc flash)",
          "Induced voltage",
        ],
      },
      { category: "Human factors", examples: [] },
    ],
    safetyCheck: "yes",
    crew: crewNames.map((name, index) => ({
      workerId: `worker-${index}`,
      name,
      signaturePng: signatureFor(name),
      signedAt: completedAt,
    })),
    documentRevision: 0,
    completedAt,
    updatedAfterCompletionAt: [],
    sync: { savedLocallyAt: completedAt, backedUpAt: null },
  });
}

export default function PdfTest() {
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    void (async () => {
      try {
        const result = await renderAhaPdf(
          sampleAha(),
          job,
          await loadAhaPdfAssets(),
        );
        if (!active) return;
        if (result.status !== "rendered") {
          setError(
            result.status === "fit_failed"
              ? result.issues.map(({ message }) => message).join(" ")
              : result.message,
          );
          return;
        }
        objectUrl = URL.createObjectURL(
          new Blob([result.bytes.slice().buffer], {
            type: "application/pdf",
          }),
        );
        setGeneratedUrl(objectUrl);
      } catch (cause) {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "The comparison PDF could not be generated.",
          );
        }
      }
    })();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, []);

  return (
    <main className="min-h-screen bg-background p-4 text-foreground">
      <header className="mx-auto mb-4 max-w-[1500px]">
        <h1 className="text-2xl font-bold">PDF visual comparison</h1>
        <p className="mt-1 text-sm font-medium text-muted-foreground">
          Development only · generated renderer on the left, approved filled
          reference on the right
        </p>
      </header>
      {error ? (
        <p
          className="mx-auto max-w-[1500px] rounded-xl bg-warning/10 p-4 font-semibold text-warning-foreground"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <div className="mx-auto grid max-w-[1500px] gap-4 lg:grid-cols-2">
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <h2 className="border-b border-border px-4 py-3 font-bold">
            Generated
          </h2>
          {generatedUrl ? (
            <iframe
              className="h-[calc(100vh-130px)] min-h-[700px] w-full"
              title="Generated AHA PDF"
              src={generatedUrl}
            />
          ) : (
            <p className="p-6">Generating…</p>
          )}
        </section>
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <h2 className="border-b border-border px-4 py-3 font-bold">
            Approved reference
          </h2>
          <iframe
            className="h-[calc(100vh-130px)] min-h-[700px] w-full"
            title="Approved AHA PDF reference"
            src={referencePdfUrl}
          />
        </section>
      </div>
    </main>
  );
}
