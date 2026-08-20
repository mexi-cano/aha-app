import { useEffect, useMemo, useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { useNavigate, useParams } from "react-router";
import { MAX_CREW_MEMBERS } from "@workspace/aha-domain";

import { AppLogo } from "@/components/aha/app-logo";
import { TextField } from "@/components/aha/form-field";
import { Button } from "@/components/ui/button";
import {
  createJob,
  getJob,
  updateJobConfiguration,
} from "@/data/job-repository";
import { createLocalId } from "@/data/aha-repository";
import {
  buildJobConfiguration,
  createEmptyJobSetupDraft,
  jobToSetupDraft,
  validateJobSetup,
  type JobSetupDraft,
  type JobSetupField,
} from "@/features/job-setup";

const FIELD_IDS = {
  name: "job-name",
  cityLabel: "job-city",
  location: "job-location",
  closestEmergencyCentre: "job-emergency-centre",
  emergencyNumber: "job-emergency-number",
  musterPoint: "job-muster-point",
  personInCharge: "job-person-in-charge",
  roster: "job-roster",
} as const satisfies Record<JobSetupField, string>;

export default function JobSetup() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const isEditing = Boolean(jobId);
  const [draft, setDraft] = useState<JobSetupDraft>(createEmptyJobSetupDraft);
  const [state, setState] = useState<"loading" | "ready" | "saving">(
    isEditing ? "loading" : "ready",
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [issues, setIssues] = useState(() => validateJobSetup(draft));

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    void getJob(jobId)
      .then((job) => {
        if (cancelled) return;
        if (!job) {
          setLoadError("That job is not available on this iPad.");
          return;
        }
        setDraft(jobToSetupDraft(job));
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(
            "We couldn't open this job setup. Nothing was changed. Try again.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const issueByField = useMemo(
    () => new Map(issues.map((issue) => [issue.field, issue.message])),
    [issues],
  );
  const update = <K extends keyof JobSetupDraft>(
    key: K,
    value: JobSetupDraft[K],
  ) => setDraft((current) => ({ ...current, [key]: value }));

  const addWorker = () => {
    if (draft.roster.length >= MAX_CREW_MEMBERS) return;
    update("roster", [...draft.roster, { id: createLocalId(), name: "" }]);
  };

  const removeWorker = (workerId: string) => {
    setDraft((current) => ({
      ...current,
      roster: current.roster.filter(({ id }) => id !== workerId),
      personInChargeMode:
        current.personInChargeWorkerId === workerId
          ? "custom"
          : current.personInChargeMode,
      personInChargeWorkerId:
        current.personInChargeWorkerId === workerId
          ? null
          : current.personInChargeWorkerId,
    }));
  };

  const submit = async () => {
    if (state === "saving") return;
    const nextIssues = validateJobSetup(draft);
    setIssues(nextIssues);
    setSaveError(null);
    if (nextIssues.length) {
      document.getElementById(FIELD_IDS[nextIssues[0]!.field])?.focus();
      return;
    }

    setState("saving");
    try {
      const configuration = buildJobConfiguration(draft);
      if (jobId) {
        await updateJobConfiguration(jobId, {
          defaults: configuration.defaults,
          roster: configuration.roster,
          defaultPersonInChargeWorkerId:
            configuration.defaultPersonInChargeWorkerId,
        });
      } else {
        await createJob(configuration);
      }
      navigate("/", { replace: true });
    } catch {
      setSaveError(
        "We couldn't save this job on the iPad. Nothing was deleted. Try again.",
      );
      setState("ready");
    }
  };

  if (state === "loading") {
    return (
      <main className="min-h-screen bg-background px-5 py-12 text-center text-base font-semibold text-muted-foreground">
        Opening job setup…
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="min-h-screen bg-background px-5 py-12">
        <section className="mx-auto max-w-lg rounded-2xl border border-card-border bg-card p-7">
          <h1 className="text-2xl font-bold">We couldn't open this job</h1>
          <p className="mt-3 text-base font-medium text-muted-foreground">
            {loadError}
          </p>
          <Button className="mt-6 min-h-12" onClick={() => navigate("/jobs")}>
            Back to jobs
          </Button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-5 pb-16 pt-7 text-foreground sm:px-7 sm:pt-10">
      <div className="mx-auto flex max-w-[700px] flex-col gap-5">
        <header className="flex items-center gap-4">
          <AppLogo />
          <Button
            variant="ghost"
            className="ml-auto min-h-12 text-base text-primary"
            onClick={() => navigate(isEditing ? "/jobs" : "/")}
          >
            Cancel
          </Button>
        </header>

        <div>
          <p className="text-sm font-bold tracking-[0.1em] text-muted-foreground">
            JOB SETUP
          </p>
          <h1 className="mt-1 text-3xl font-bold">
            {isEditing ? "Update job defaults" : "Set up this job"}
          </h1>
          <p className="mt-2 text-base font-medium leading-relaxed text-muted-foreground">
            Defaults are saved on this iPad. Normal mornings still start from
            the most recent AHA; these defaults are used for a blank start.
          </p>
        </div>

        {issues.length ? (
          <section
            className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3"
            role="alert"
          >
            <p className="text-base font-bold">Finish the highlighted setup</p>
            <ul className="mt-1 list-disc pl-5 text-base font-medium">
              {issues.map((issue) => (
                <li key={`${issue.field}:${issue.message}`}>{issue.message}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="flex flex-col gap-5 rounded-[14px] border border-card-border bg-card p-5 sm:p-7">
          <div>
            <h2 className="text-xl font-bold">Job</h2>
            {isEditing ? (
              <p className="mt-1 text-base font-medium text-muted-foreground">
                Job identity is fixed so historical AHAs cannot be relabeled.
              </p>
            ) : null}
          </div>
          <TextField
            id={FIELD_IDS.name}
            label="Job name"
            requirement="required"
            value={draft.name}
            disabled={isEditing}
            aria-invalid={issueByField.has("name")}
            onChange={(event) => update("name", event.target.value)}
          />
          <TextField
            id={FIELD_IDS.cityLabel}
            label="City or area"
            requirement="required"
            value={draft.cityLabel}
            disabled={isEditing}
            aria-invalid={issueByField.has("cityLabel")}
            onChange={(event) => update("cityLabel", event.target.value)}
          />
        </section>

        <section className="flex flex-col gap-5 rounded-[14px] border border-card-border bg-card p-5 sm:p-7">
          <h2 className="text-xl font-bold">Default site details</h2>
          <TextField
            id={FIELD_IDS.location}
            label="Location"
            requirement="required"
            value={draft.location}
            aria-invalid={issueByField.has("location")}
            onChange={(event) => update("location", event.target.value)}
          />
          <TextField
            id={FIELD_IDS.closestEmergencyCentre}
            label="Closest emergency centre"
            requirement="required"
            value={draft.closestEmergencyCentre}
            aria-invalid={issueByField.has("closestEmergencyCentre")}
            onChange={(event) =>
              update("closestEmergencyCentre", event.target.value)
            }
          />
          <TextField
            id={FIELD_IDS.emergencyNumber}
            label="Emergency number"
            requirement="required"
            value={draft.emergencyNumber}
            aria-invalid={issueByField.has("emergencyNumber")}
            onChange={(event) => update("emergencyNumber", event.target.value)}
          />
          <TextField
            id={FIELD_IDS.musterPoint}
            label="Muster point"
            requirement="required"
            value={draft.musterPoint}
            aria-invalid={issueByField.has("musterPoint")}
            onChange={(event) => update("musterPoint", event.target.value)}
          />
          <TextField
            id="job-work-order"
            label="Work order / permit number"
            requirement="optional"
            value={draft.workOrderPermit}
            onChange={(event) => update("workOrderPermit", event.target.value)}
          />
          <TextField
            id="job-jha"
            label="JHA / procedure numbers"
            requirement="optional"
            value={draft.jhaProcedureNumbers}
            onChange={(event) =>
              update("jhaProcedureNumbers", event.target.value)
            }
          />
        </section>

        <section
          id={FIELD_IDS.roster}
          tabIndex={-1}
          className="flex flex-col gap-4 rounded-[14px] border border-card-border bg-card p-5 outline-none sm:p-7"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">Job roster</h2>
              <p className="mt-1 text-base font-medium text-muted-foreground">
                Worker names are isolated to this job. An empty roster is
                allowed, but Review will require a crew before signing.
              </p>
            </div>
            <span className="shrink-0 text-base font-semibold text-muted-foreground">
              {draft.roster.length}/{MAX_CREW_MEMBERS}
            </span>
          </div>
          {draft.roster.map((worker, index) => (
            <div key={worker.id} className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <TextField
                  id={`job-worker-${worker.id}`}
                  label={`Worker ${index + 1}`}
                  value={worker.name}
                  onChange={(event) =>
                    update(
                      "roster",
                      draft.roster.map((candidate) =>
                        candidate.id === worker.id
                          ? { ...candidate, name: event.target.value }
                          : candidate,
                      ),
                    )
                  }
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="min-h-12 min-w-12"
                aria-label={`Remove worker ${index + 1}`}
                onClick={() => removeWorker(worker.id)}
              >
                <Trash2 className="size-5" aria-hidden="true" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            className="min-h-12 border-dashed text-base text-primary"
            disabled={draft.roster.length >= MAX_CREW_MEMBERS}
            onClick={addWorker}
          >
            <Plus className="size-5" aria-hidden="true" /> Add worker
          </Button>
        </section>

        <section
          id={FIELD_IDS.personInCharge}
          tabIndex={-1}
          className="flex flex-col gap-4 rounded-[14px] border border-card-border bg-card p-5 outline-none sm:p-7"
        >
          <div>
            <h2 className="text-xl font-bold">Default Person in charge</h2>
            <p className="mt-1 text-base font-medium text-muted-foreground">
              Choose after entering the roster so duplicate names remain
              unambiguous.
            </p>
          </div>
          {draft.roster.map((worker, index) => {
            const selected =
              draft.personInChargeMode === "worker" &&
              draft.personInChargeWorkerId === worker.id;
            const duplicateCount = draft.roster.filter(
              ({ name }) =>
                name.trim().toLocaleLowerCase() ===
                worker.name.trim().toLocaleLowerCase(),
            ).length;
            const duplicateIndex =
              draft.roster
                .filter(
                  ({ name }) =>
                    name.trim().toLocaleLowerCase() ===
                    worker.name.trim().toLocaleLowerCase(),
                )
                .findIndex(({ id }) => id === worker.id) + 1;
            return (
              <Button
                key={worker.id}
                type="button"
                variant="outline"
                className="min-h-12 justify-start text-left text-base"
                aria-pressed={selected}
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    personInChargeMode: "worker",
                    personInChargeWorkerId: worker.id,
                  }))
                }
              >
                {selected ? (
                  <Check className="size-5 text-success" aria-hidden="true" />
                ) : null}
                <span className="min-w-0 truncate">
                  {worker.name || `Worker ${index + 1}`}
                </span>
                {duplicateCount > 1 ? (
                  <span className="ml-auto text-sm text-muted-foreground">
                    {duplicateIndex} of {duplicateCount}
                  </span>
                ) : null}
              </Button>
            );
          })}
          <Button
            type="button"
            variant="outline"
            className="min-h-12 justify-start text-base"
            aria-pressed={draft.personInChargeMode === "custom"}
            onClick={() => update("personInChargeMode", "custom")}
          >
            {draft.personInChargeMode === "custom" ? (
              <Check className="size-5 text-success" aria-hidden="true" />
            ) : null}
            Someone else
          </Button>
          {draft.personInChargeMode === "custom" ? (
            <TextField
              id="job-custom-person-in-charge"
              label="Name"
              requirement="required"
              value={draft.customPersonInCharge}
              aria-invalid={issueByField.has("personInCharge")}
              onChange={(event) =>
                update("customPersonInCharge", event.target.value)
              }
            />
          ) : null}
        </section>

        {saveError ? (
          <p
            className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-base font-semibold text-destructive"
            role="alert"
          >
            {saveError}
          </p>
        ) : null}
        <Button
          className="min-h-16 w-full rounded-[14px] text-lg font-bold"
          disabled={state === "saving"}
          onClick={() => void submit()}
        >
          {state === "saving"
            ? "SAVING…"
            : isEditing
              ? "SAVE JOB DEFAULTS"
              : "SAVE JOB SETUP"}
        </Button>
      </div>
    </main>
  );
}
