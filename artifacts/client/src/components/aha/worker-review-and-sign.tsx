import { useRef, useState, type ReactNode } from "react";
import {
  type Aha,
  type Job,
} from "@workspace/aha-domain";

import { AhaSummary } from "@/components/aha/aha-summary";
import { ForemanBadge } from "@/components/aha/foreman-badge";
import {
  SignatureCanvas,
  type SignatureCanvasHandle,
} from "@/components/aha/signature-canvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getWorkerReviewCopy,
  type WorkerReviewLanguage,
} from "@/features/aha-editor/worker-review-copy";
import { formatLongDate } from "@/lib/date-format";

interface WorkerNameInput {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  helper?: string;
}

interface WorkerReviewAndSignProps {
  aha: Aha;
  job: Job;
  signerName: string;
  isForeman?: boolean;
  nameInput?: WorkerNameInput;
  disabled?: boolean;
  confirmDisabled?: boolean;
  confirmLabel?: string;
  feedback?: ReactNode;
  language?: WorkerReviewLanguage;
  onLanguageChange?: (language: WorkerReviewLanguage) => void;
  onInkChange?: (hasInk: boolean) => void;
  onConfirm: (signaturePng: string) => void | Promise<void>;
}

export function WorkerReviewAndSign({
  aha,
  job,
  signerName,
  isForeman = false,
  nameInput,
  disabled = false,
  confirmDisabled = false,
  confirmLabel,
  feedback,
  language = "en",
  onLanguageChange,
  onInkChange,
  onConfirm,
}: WorkerReviewAndSignProps) {
  const signatureRef = useRef<SignatureCanvasHandle>(null);
  const [hasInk, setHasInk] = useState(false);
  const normalizedSignerName = signerName.trim();
  const copy = getWorkerReviewCopy(language);

  const updateInk = (value: boolean) => {
    setHasInk(value);
    onInkChange?.(value);
  };

  const clear = () => {
    signatureRef.current?.clear();
    updateInk(false);
  };

  const confirm = () => {
    if (disabled || confirmDisabled) return;
    const signaturePng = signatureRef.current?.toPng();
    if (!signaturePng) return;
    void onConfirm(signaturePng);
  };

  return (
    <div className="flex flex-col gap-5" lang={copy.locale}>
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <h1 className="text-[28px] font-bold sm:text-3xl">
              {normalizedSignerName || copy.addWorkerTitle}
            </h1>
            {isForeman ? <ForemanBadge label={copy.foreman} /> : null}
            <span className="inline-flex min-h-8 items-center rounded-lg border-[1.5px] border-[#C6CDE8] px-3 text-[13px] font-bold tracking-[0.08em] text-primary">
              {copy.readOnly}
            </span>
          </div>
          <div
            className="inline-flex min-h-12 shrink-0 rounded-[10px] border-[1.5px] border-[#C6CDE8] bg-card p-1"
            aria-label={copy.languageControlLabel}
          >
            {(["en", "es"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={language === option}
                className={`min-h-12 rounded-md px-3 text-sm font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  language === option
                    ? "bg-primary text-primary-foreground"
                    : "text-primary hover:bg-secondary"
                }`}
                onClick={() => onLanguageChange?.(option)}
              >
                {option === "en" ? "English" : "Español"}
              </button>
            ))}
          </div>
        </div>
        <p className="sr-only" role="status" aria-live="polite">
          {copy.languageAnnouncement}
        </p>
        <p className="text-[17px] font-medium text-muted-foreground">
          {copy.signingFor} {formatLongDate(aha.date, copy.locale)}
        </p>
      </header>

      {nameInput ? (
        <label className="flex flex-col gap-2 text-base font-bold">
          <span>
            {copy.workerName}{" "}
            <span className="font-medium text-muted-foreground">
              — {nameInput.helper ?? copy.workerNameHelper}
            </span>
          </span>
          <Input
            value={nameInput.value}
            required
            className="min-h-14 text-xl font-semibold"
            placeholder={copy.workerNamePlaceholder}
            autoComplete="name"
            disabled={disabled || nameInput.disabled}
            onChange={(event) => nameInput.onChange(event.target.value)}
          />
        </label>
      ) : null}

      <p className="rounded-xl border border-[#C6CDE8] bg-secondary px-5 py-4 text-base font-semibold leading-relaxed text-secondary-foreground">
        {copy.reviewNotice}
      </p>

      <AhaSummary
        aha={aha}
        job={job}
        mode="signing"
        showCrew={false}
        workerReviewLanguage={language}
      />

      <section
        className="flex flex-col gap-4 rounded-[14px] border border-card-border bg-card px-5 py-5 sm:px-6"
        aria-labelledby="acknowledgment-signature-heading"
      >
        <div>
          <h2
            id="acknowledgment-signature-heading"
            className="text-xl font-bold"
          >
            {copy.acknowledgmentHeading}
          </h2>
          <p className="mt-1 text-base font-medium text-muted-foreground">
            {copy.acknowledgmentHelper}
          </p>
        </div>

        <p className="rounded-xl border border-[#C6CDE8] bg-secondary px-5 py-[18px] text-[17px] font-medium leading-[1.5]">
          {copy.acknowledgment}
        </p>

        <h3 className="text-lg font-bold">
          {copy.signAs(normalizedSignerName || copy.thisWorker)}
        </h3>
        <SignatureCanvas
          ref={signatureRef}
          ariaLabel={copy.signatureAreaLabel}
          disabled={disabled}
          onInkChange={updateInk}
          placeholder={copy.signaturePlaceholder}
        />
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            className="min-h-16 px-6 text-[17px] text-primary"
            disabled={!hasInk || disabled}
            onClick={clear}
          >
            {copy.clear}
          </Button>
          <Button
            type="button"
            className="min-h-16 flex-1 text-[19px] font-bold tracking-wide"
            disabled={!hasInk || disabled || confirmDisabled}
            onClick={confirm}
          >
            {confirmLabel ?? copy.confirmSignature}
          </Button>
        </div>
        {feedback}
      </section>
    </div>
  );
}
