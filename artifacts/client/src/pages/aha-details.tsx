import { useEffect } from "react";
import { useSearchParams } from "react-router";

import { EditorShell } from "@/components/aha/editor-shell";
import { TextAreaField, TextField } from "@/components/aha/form-field";
import { PrefillBanner } from "@/components/aha/prefill-banner";
import { Button } from "@/components/ui/button";
import { useAhaEditor } from "@/features/aha-editor/editor-context";
import { formatLongDate } from "@/lib/date-format";
import { cn } from "@/lib/utils";
import { scrollToAndFocus } from "@/features/aha-editor/editor-navigation";

export default function AhaDetails() {
  const { aha, updateAha, navigateSafely } = useAhaEditor();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const focus = searchParams.get("focus");
    if (focus) scrollToAndFocus(focus);
  }, [searchParams]);

  const updateHeader = (
    key: Exclude<keyof typeof aha.header, "date">,
    value: string | boolean | null,
  ) => {
    updateAha((current) => ({
      ...current,
      header: { ...current.header, [key]: value },
    }));
  };

  const updateOptionalHeader = (
    key: "workOrderPermit" | "jhaProcedureNumbers",
    value: string,
  ) => {
    updateAha((current) => ({
      ...current,
      header: { ...current.header, [key]: value },
      notApplicable: value.trim()
        ? { ...current.notApplicable, [key]: false }
        : current.notApplicable,
    }));
  };

  return (
    <EditorShell>
      <div className="flex flex-col gap-5">
        <PrefillBanner />
        <header>
          <h1 className="text-[28px] font-bold">Details</h1>
          <p className="mt-1 text-base font-medium text-muted-foreground">
            Site, emergency, and work information for today
          </p>
        </header>

        <section className="rounded-[14px] border border-card-border bg-card p-5 sm:p-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <span className="text-base font-bold">Date</span>
              <div className="flex min-h-12 items-center rounded-[10px] border border-border bg-background px-4 text-base font-semibold text-muted-foreground">
                {formatLongDate(aha.date)}
              </div>
            </div>
            <TextField
              id="location"
              label="Location"
              value={aha.header.location}
              onChange={(event) => updateHeader("location", event.target.value)}
            />
            <TextField
              id="person-in-charge"
              label="Person in charge"
              value={aha.header.personInCharge}
              onChange={(event) =>
                updateHeader("personInCharge", event.target.value)
              }
            />
            <TextField
              id="closest-emergency-centre"
              label="Closest emergency centre"
              value={aha.header.closestEmergencyCentre}
              onChange={(event) =>
                updateHeader("closestEmergencyCentre", event.target.value)
              }
            />
            <TextField
              id="emergency-number"
              label="Emergency number"
              inputMode="tel"
              value={aha.header.emergencyNumber}
              onChange={(event) =>
                updateHeader("emergencyNumber", event.target.value)
              }
            />
            <TextField
              id="work-order-permit"
              label="Work order / permit number"
              value={aha.header.workOrderPermit}
              onChange={(event) =>
                updateOptionalHeader("workOrderPermit", event.target.value)
              }
            />
            <TextField
              id="jha-procedure-numbers"
              label="JHA / procedure numbers"
              value={aha.header.jhaProcedureNumbers}
              onChange={(event) =>
                updateOptionalHeader("jhaProcedureNumbers", event.target.value)
              }
            />
            <TextField
              id="muster-point"
              label="Muster point"
              value={aha.header.musterPoint}
              onChange={(event) =>
                updateHeader("musterPoint", event.target.value)
              }
            />
            <fieldset className="flex flex-col gap-2">
              <legend className="text-base font-bold">
                Is a rescue plan required?
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Yes", value: true },
                  { label: "No", value: false },
                ].map((option) => (
                  <button
                    key={option.label}
                    id={option.value ? "rescue-plan-yes" : "rescue-plan-no"}
                    type="button"
                    className={cn(
                      "min-h-12 rounded-[10px] border-[1.5px] px-4 text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      aha.header.rescuePlanRequired === option.value
                        ? "border-primary bg-secondary text-secondary-foreground"
                        : "border-input bg-card text-foreground",
                    )}
                    aria-pressed={
                      aha.header.rescuePlanRequired === option.value
                    }
                    onClick={() =>
                      updateHeader("rescuePlanRequired", option.value)
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
        </section>

        <section className="rounded-[14px] border border-card-border bg-card p-5 sm:p-6">
          <TextAreaField
            id="work-description"
            label="Description of work"
            hint="Work on site and activities nearby"
            rows={4}
            value={aha.description}
            onChange={(event) =>
              updateAha((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
          />
        </section>

        <div className="pt-1">
          <Button
            className="min-h-[72px] w-full rounded-[14px] text-xl font-bold tracking-wide"
            onClick={() => void navigateSafely(`/ahas/${aha.id}/work`)}
          >
            CONTINUE
          </Button>
          <p className="mt-2 text-center text-base font-medium text-muted-foreground">
            Next: 2 Work
          </p>
        </div>
      </div>
    </EditorShell>
  );
}
