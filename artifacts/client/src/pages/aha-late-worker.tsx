import { useRef, useState } from "react";
import type { PointGroup } from "signature_pad";
import {
  MAX_CREW_MEMBERS,
  WORKER_ACKNOWLEDGMENT,
  addLateSignedCrewMember,
} from "@workspace/aha-domain";

import { AhaSummary } from "@/components/aha/aha-summary";
import {
  SignatureCanvas,
  type SignatureCanvasHandle,
} from "@/components/aha/signature-canvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createLocalId } from "@/data/aha-repository";
import { useAhaEditor } from "@/features/aha-editor/editor-context";
import { formatLongDate } from "@/lib/date-format";
import {
  analyzeAhaPdfFit,
  saveAhaAndGeneratePdf,
  type PdfFitIssue,
} from "@/pdf";

export default function AhaLateWorker() {
  const { aha, job, commitAha, navigateSafely } = useAhaEditor();
  const [view, setView] = useState<"sign" | "review">("sign");
  const [name, setName] = useState("");
  const [workerId] = useState(() => createLocalId());
  const [hasInk, setHasInk] = useState(false);
  const [stagedData, setStagedData] = useState<PointGroup[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fitIssues, setFitIssues] = useState<PdfFitIssue[]>([]);
  const signatureRef = useRef<SignatureCanvasHandle>(null);

  const openReview = () => {
    setStagedData(signatureRef.current?.toData() ?? []);
    setView("review");
  };

  const confirm = async () => {
    const signaturePng = signatureRef.current?.toPng();
    if (!signaturePng || !name.trim() || isSaving) return;
    setIsSaving(true);
    setError(null);
    setFitIssues([]);
    try {
      const now = new Date();
      let candidate;
      try {
        candidate = addLateSignedCrewMember(
          aha,
          { id: workerId, name },
          signaturePng,
          now,
        );
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "This worker could not be added.",
        );
        return;
      }
      let fit;
      try {
        fit = await analyzeAhaPdfFit(candidate, job);
      } catch {
        setError(
          "We couldn't check the official PDF. The new signature has not been saved. Try again.",
        );
        return;
      }
      if (fit.issues.length > 0) {
        setFitIssues(fit.issues);
        return;
      }
      const result = await saveAhaAndGeneratePdf({
        commitAha,
        update: (current) =>
          addLateSignedCrewMember(
            current,
            { id: workerId, name },
            signaturePng,
            now,
          ),
        job,
      });
      if (result.status === "save_failed") {
        setError(
          "We couldn't save this signature. It is still on this screen. Try again.",
        );
        return;
      }
      if (result.status === "fit_failed") {
        setFitIssues(result.issues);
      }
      await navigateSafely(`/ahas/${result.savedAha.id}/completed`);
    } finally {
      setIsSaving(false);
    }
  };

  if (aha.status !== "completed" || aha.crew.length >= MAX_CREW_MEMBERS) {
    return (
      <main className="min-h-screen bg-background px-5 py-12 text-center">
        <h1 className="text-xl font-bold">No signature slot is available.</h1>
        <p className="mt-2 text-base font-medium text-muted-foreground">
          The official ITS sheet holds no more than ten workers.
        </p>
        <Button
          className="mt-5 min-h-12"
          onClick={() => void navigateSafely(`/ahas/${aha.id}/completed`)}
        >
          Return to Completed
        </Button>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card px-4 py-3">
        <div className="mx-auto flex max-w-[834px] items-center gap-3">
          <button
            type="button"
            className="min-h-12 rounded-lg px-2 text-base font-semibold text-primary"
            disabled={isSaving}
            onClick={() => void navigateSafely(`/ahas/${aha.id}/completed`)}
          >
            ‹ Completed
          </button>
          <p className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-muted-foreground sm:text-base">
            {job.name} — {formatLongDate(aha.date)}
          </p>
          <span className="w-20" />
        </div>
      </header>
      <div className="mx-auto max-w-[748px] px-5 py-6 sm:px-6">
        {view === "review" ? (
          <div className="flex flex-col gap-4">
            <button
              type="button"
              className="min-h-12 self-start rounded-lg px-1 text-[17px] font-semibold text-primary"
              onClick={() => setView("sign")}
            >
              ‹ Back to signing
            </button>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[28px] font-bold">Today's AHA</h1>
              <span className="inline-flex min-h-8 items-center rounded-lg border-[1.5px] border-[#C6CDE8] px-3 text-[13px] font-bold tracking-[0.08em] text-primary">
                READ ONLY
              </span>
            </div>
            <AhaSummary aha={aha} job={job} mode="signing" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <header>
              <h1 className="text-[28px] font-bold">Add worker &amp; sign</h1>
              <p className="mt-1 text-base font-medium text-muted-foreground">
                Adds a late arrival without changing completion time or existing
                signatures
              </p>
            </header>
            <label className="flex flex-col gap-2 text-base font-bold">
              Worker name
              <Input
                value={name}
                className="min-h-14 text-xl font-semibold"
                placeholder="First and last name"
                autoComplete="name"
                disabled={isSaving}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="min-h-12 self-start rounded-lg px-1 text-[17px] font-semibold text-primary underline underline-offset-4"
              onClick={openReview}
            >
              Review the AHA ›
            </button>
            <p className="rounded-xl border border-[#C6CDE8] bg-secondary px-5 py-[18px] text-[17px] font-medium leading-[1.5]">
              {WORKER_ACKNOWLEDGMENT}
            </p>
            <SignatureCanvas
              ref={signatureRef}
              disabled={isSaving}
              initialData={stagedData}
              onInkChange={setHasInk}
            />
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="min-h-16 px-6 text-[17px] text-primary"
                disabled={!hasInk || isSaving}
                onClick={() => {
                  signatureRef.current?.clear();
                  setHasInk(false);
                  setStagedData([]);
                }}
              >
                Clear
              </Button>
              <Button
                type="button"
                className="min-h-16 flex-1 text-[19px] font-bold tracking-wide"
                disabled={!hasInk || !name.trim() || isSaving}
                onClick={() => void confirm()}
              >
                {isSaving ? "SAVING…" : "CONFIRM SIGNATURE"}
              </Button>
            </div>
            {fitIssues.length > 0 ? (
              <div
                className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-warning-foreground"
                role="alert"
              >
                {fitIssues.map((issue) => (
                  <p key={issue.fieldPath} className="font-semibold">
                    {issue.message}
                  </p>
                ))}
              </div>
            ) : null}
            {error ? (
              <p
                className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 font-semibold text-warning-foreground"
                role="alert"
              >
                {error}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </main>
  );
}
