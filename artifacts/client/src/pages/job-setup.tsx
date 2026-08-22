import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Plus, RotateCw, Trash2 } from "lucide-react";
import { useNavigate, useParams } from "react-router";
import {
  findUniqueWorkerIdByName,
  MAX_CREW_MEMBERS,
} from "@workspace/aha-domain";

import { AppLogo } from "@/components/aha/app-logo";
import { EmergencyContactField } from "@/components/aha/emergency-contact-field";
import { TextField } from "@/components/aha/form-field";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  createJob,
  getJob,
  updateJobConfiguration,
} from "@/data/job-repository";
import {
  discardJobSetupDraft,
  getJobSetupDraft,
  jobSetupDraftKey,
  saveJobSetupDraft,
} from "@/data/job-setup-draft-repository";
import { createLocalId } from "@/data/aha-repository";
import {
  buildJobConfiguration,
  createEmptyJobSetupDraft,
  getVisibleJobSetupIssues,
  jobToSetupDraft,
  validateJobSetup,
  type JobSetupDraft,
  type JobSetupField,
} from "@/features/job-setup";
import { cityOrAreaLocationSuggestion } from "@/features/location-assistance";
import { createSerializedPersistence } from "@/features/aha-editor/persistence-queue";
import { useRecoveryState } from "@/features/restore/restore-gate";

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
  const { isWriteBlocked } = useRecoveryState();
  const [draft, setDraft] = useState<JobSetupDraft>(createEmptyJobSetupDraft);
  const [state, setState] = useState<"loading" | "ready" | "submitting">(
    "loading",
  );
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">(
    "saved",
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [leaveAsk, setLeaveAsk] = useState(false);
  const [discardAsk, setDiscardAsk] = useState(false);
  const draftRef = useRef(draft);
  const pendingRef = useRef<JobSetupDraft | null>(null);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const saveStateRef = useRef(saveState);
  const [persistSerially] = useState(() =>
    createSerializedPersistence(
      ({
        targetJobId,
        value,
      }: {
        targetJobId: string | null;
        value: JobSetupDraft;
      }) => saveJobSetupDraft(targetJobId, value),
    ),
  );
  const issues = useMemo(
    () => getVisibleJobSetupIssues(draft, hasAttemptedSubmit),
    [draft, hasAttemptedSubmit],
  );
  const matchingPersonInChargeWorkerId = useMemo(
    () =>
      draft.personInChargeMode === "custom"
        ? findUniqueWorkerIdByName(draft.roster, draft.customPersonInCharge)
        : null,
    [draft],
  );
  const matchingPersonInChargeWorker = draft.roster.find(
    ({ id }) => id === matchingPersonInChargeWorkerId,
  );

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getJobSetupDraft(jobId), jobId ? getJob(jobId) : null])
      .then(([savedDraft, job]) => {
        if (cancelled) return;
        if (jobId && !job) {
          setLoadError("That job is not available on this iPad.");
          setState("ready");
          return;
        }
        const initial =
          savedDraft?.draft ??
          (job ? jobToSetupDraft(job) : createEmptyJobSetupDraft());
        draftRef.current = initial;
        setDraft(initial);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(
            "We couldn't open this job setup. Nothing was changed. Try again.",
          );
          setState("ready");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  useEffect(() => {
    saveStateRef.current = saveState;
  }, [saveState]);

  const runSaveQueue = useCallback((): Promise<boolean> => {
    if (savePromiseRef.current) return savePromiseRef.current;
    const promise = (async () => {
      setSaveState("saving");
      while (pendingRef.current) {
        const pending = pendingRef.current;
        pendingRef.current = null;
        try {
          await persistSerially({ targetJobId: jobId ?? null, value: pending });
        } catch {
          pendingRef.current = pendingRef.current ?? pending;
          setSaveState("error");
          return false;
        }
      }
      setSaveState("saved");
      return true;
    })().finally(() => {
      savePromiseRef.current = null;
      if (pendingRef.current && saveStateRef.current !== "error") {
        queueMicrotask(() => void runSaveQueue());
      }
    });
    savePromiseRef.current = promise;
    return promise;
  }, [jobId, persistSerially]);

  const flushSetupSave = useCallback(async (): Promise<boolean> => {
    while (pendingRef.current || savePromiseRef.current) {
      if (!(await runSaveQueue())) return false;
    }
    return saveStateRef.current !== "error";
  }, [runSaveQueue]);

  useEffect(() => {
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") void runSaveQueue();
    };
    const flushOnPageHide = () => void runSaveQueue();
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (
        !pendingRef.current &&
        !savePromiseRef.current &&
        saveStateRef.current !== "error"
      )
        return;
      event.preventDefault();
      event.returnValue = "";
    };
    document.addEventListener("visibilitychange", flushWhenHidden);
    window.addEventListener("pagehide", flushOnPageHide);
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", flushWhenHidden);
      window.removeEventListener("pagehide", flushOnPageHide);
      window.removeEventListener("beforeunload", warnBeforeUnload);
    };
  }, [runSaveQueue]);

  const issueByField = useMemo(
    () => new Map(issues.map((issue) => [issue.field, issue.message])),
    [issues],
  );
  const cityForLocation = cityOrAreaLocationSuggestion(
    draft.cityLabel,
    draft.location,
  );
  const replaceDraft = useCallback(
    (next: JobSetupDraft) => {
      draftRef.current = next;
      pendingRef.current = next;
      setDraft(next);
      setSaveError(null);
      void runSaveQueue();
    },
    [runSaveQueue],
  );
  const update = <K extends keyof JobSetupDraft>(
    key: K,
    value: JobSetupDraft[K],
  ) => replaceDraft({ ...draftRef.current, [key]: value });

  const addWorker = () => {
    if (draft.roster.length >= MAX_CREW_MEMBERS) return;
    update("roster", [...draft.roster, { id: createLocalId(), name: "" }]);
  };

  const removeWorker = (workerId: string) => {
    const current = draftRef.current;
    replaceDraft({
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
    });
  };

  const back = async () => {
    if (await flushSetupSave()) {
      navigate(isEditing ? "/jobs" : "/");
    } else {
      setLeaveAsk(true);
    }
  };

  const retrySave = async () => {
    setSaveError(null);
    return runSaveQueue();
  };

  const discard = async () => {
    pendingRef.current = null;
    await savePromiseRef.current;
    try {
      await discardJobSetupDraft(jobId);
      navigate(isEditing ? "/jobs" : "/", { replace: true });
    } catch {
      setSaveError(
        "We couldn't discard this setup. It remains saved on this iPad.",
      );
    }
  };

  const submit = async () => {
    if (state === "submitting") return;
    if (!(await flushSetupSave())) return;
    const currentDraft = draftRef.current;
    const nextIssues = validateJobSetup(currentDraft);
    setHasAttemptedSubmit(true);
    setSaveError(null);
    if (nextIssues.length) {
      document.getElementById(FIELD_IDS[nextIssues[0]!.field])?.focus();
      return;
    }

    setState("submitting");
    try {
      const configuration = buildJobConfiguration(currentDraft);
      const completedDraftKey = jobSetupDraftKey(jobId);
      if (jobId) {
        await updateJobConfiguration(
          jobId,
          {
            defaults: configuration.defaults,
            roster: configuration.roster,
            defaultPersonInChargeWorkerId:
              configuration.defaultPersonInChargeWorkerId,
          },
          new Date(),
          completedDraftKey,
        );
      } else {
        await createJob(configuration, new Date(), completedDraftKey);
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
        <header className="flex flex-wrap items-center gap-3">
          <AppLogo />
          <div className="ml-auto text-right">
            {isWriteBlocked ? (
              <span className="text-sm font-semibold text-muted-foreground">
                Recovery paused · Read only
              </span>
            ) : saveState === "error" ? (
              <Button
                variant="outline"
                className="min-h-12 text-destructive"
                onClick={() => void retrySave()}
              >
                <RotateCw aria-hidden="true" /> Retry save
              </Button>
            ) : saveState === "saving" ? (
              <span
                className="text-sm font-semibold text-muted-foreground"
                aria-live="polite"
              >
                Saving…
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground"
                aria-live="polite"
              >
                Saved on this iPad
                <Check
                  className="size-5 text-success"
                  strokeWidth={3}
                  aria-hidden="true"
                />
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            className="min-h-12 text-base text-primary"
            onClick={() => void back()}
          >
            Back
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

        {isWriteBlocked ? (
          <section className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3">
            <p className="text-base font-bold text-warning-foreground">
              Setup is read-only while recovery is paused
            </p>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              Every saved field remains on this iPad. Resume recovery before
              changing or finishing this setup.
            </p>
          </section>
        ) : null}

        <fieldset disabled={isWriteBlocked} className="contents">
          {!hasAttemptedSubmit ? (
            <section className="rounded-xl border border-card-border bg-card px-4 py-4">
              <h2 className="text-lg font-bold">Before you begin</h2>
              <p className="mt-1 text-base font-medium leading-relaxed text-muted-foreground">
                Have the project identity, work location, emergency details,
                usual crew, and default Person in charge ready.
              </p>
              <p className="mt-2 text-base font-medium leading-relaxed text-muted-foreground">
                Site defaults and the roster can be updated later. The job name
                and city or area become permanent after creation.
              </p>
            </section>
          ) : issues.length ? (
            <section
              className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3"
              role="alert"
            >
              <p className="text-base font-bold">
                Finish the highlighted setup
              </p>
              <ul className="mt-1 list-disc pl-5 text-base font-medium">
                {issues.map((issue) => (
                  <li key={`${issue.field}:${issue.message}`}>
                    {issue.message}
                  </li>
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
              description="The project name your crew uses to identify this job."
              requirement="required"
              value={draft.name}
              disabled={isEditing}
              aria-invalid={issueByField.has("name")}
              onChange={(event) => update("name", event.target.value)}
            />
            <TextField
              id={FIELD_IDS.cityLabel}
              label="City or area"
              description="The general work area used to distinguish this job."
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
              description="The street address, intersection, station, subdivision, easement, or work area printed on each AHA."
              requirement="required"
              value={draft.location}
              aria-invalid={issueByField.has("location")}
              onChange={(event) => update("location", event.target.value)}
              assistiveAction={
                cityForLocation
                  ? {
                      label: "Use city or area",
                      onClick: () => update("location", cityForLocation),
                    }
                  : undefined
              }
            />
            <TextField
              id={FIELD_IDS.closestEmergencyCentre}
              label="Closest emergency centre"
              description="The facility identified in the site emergency plan."
              requirement="required"
              value={draft.closestEmergencyCentre}
              aria-invalid={issueByField.has("closestEmergencyCentre")}
              onChange={(event) =>
                update("closestEmergencyCentre", event.target.value)
              }
            />
            <EmergencyContactField
              id={FIELD_IDS.emergencyNumber}
              description="The number the crew should call for a site emergency."
              value={draft.emergencyNumber}
              invalid={issueByField.has("emergencyNumber")}
              onValueChange={(value) => update("emergencyNumber", value)}
            />
            <TextField
              id={FIELD_IDS.musterPoint}
              label="Muster point"
              description="Where the crew meets during an evacuation."
              requirement="required"
              value={draft.musterPoint}
              aria-invalid={issueByField.has("musterPoint")}
              onChange={(event) => update("musterPoint", event.target.value)}
            />
            <TextField
              id="job-work-order"
              label="Work order / permit number"
              description="An optional default used only when starting an AHA from a blank form."
              requirement="optional"
              value={draft.workOrderPermit}
              onChange={(event) =>
                update("workOrderPermit", event.target.value)
              }
            />
            <TextField
              id="job-jha"
              label="JHA / procedure numbers"
              description="An optional default used only when starting an AHA from a blank form."
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
                  Add the workers usually assigned to this job. Today's crew can
                  still be adjusted during Review. An empty roster is allowed,
                  but Review requires a crew before signing.
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
                Choose the foreman or person responsible for the work. They do
                not have to be in the signing crew. Choose after entering the
                roster so duplicate names remain unambiguous.
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
                    replaceDraft({
                      ...draftRef.current,
                      personInChargeMode: "worker",
                      personInChargeWorkerId: worker.id,
                    })
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
              <>
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
                {matchingPersonInChargeWorker ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-12 justify-start border-[#C6CDE8] text-left text-sm font-bold text-primary"
                    onClick={() =>
                      replaceDraft({
                        ...draftRef.current,
                        personInChargeMode: "worker",
                        personInChargeWorkerId: matchingPersonInChargeWorker.id,
                      })
                    }
                  >
                    Connect to {matchingPersonInChargeWorker.name} in
                    today&apos;s crew
                  </Button>
                ) : null}
              </>
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
            disabled={state === "submitting" || saveState === "error"}
            onClick={() => void submit()}
          >
            {state === "submitting"
              ? "SAVING…"
              : isEditing
                ? "SAVE JOB DEFAULTS"
                : "SAVE JOB SETUP"}
          </Button>
          <Button
            variant="ghost"
            className="min-h-12 text-base text-destructive"
            onClick={() => setDiscardAsk(true)}
          >
            Discard setup
          </Button>
        </fieldset>
      </div>

      <AlertDialog open={leaveAsk} onOpenChange={setLeaveAsk}>
        <AlertDialogContent className="max-w-md rounded-2xl bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Setup has not finished saving</AlertDialogTitle>
            <AlertDialogDescription className="text-base font-medium">
              Retry before going back so every field and worker remains saved on
              this iPad.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="min-h-12 text-base">
              Stay
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-12 text-base"
              onClick={() =>
                void retrySave().then((saved) => {
                  if (saved) navigate(isEditing ? "/jobs" : "/");
                })
              }
            >
              Retry save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={discardAsk} onOpenChange={setDiscardAsk}>
        <AlertDialogContent className="max-w-md rounded-2xl bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this setup?</AlertDialogTitle>
            <AlertDialogDescription className="text-base font-medium">
              Every field and worker entered in this unfinished setup will be
              removed from this iPad. Existing saved jobs are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="min-h-12 text-base">
              Keep setup
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-12 bg-destructive text-base text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void discard()}
            >
              Discard setup
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
